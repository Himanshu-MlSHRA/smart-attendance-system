"""Smart Attendance System API.

Run with:  python -m server.app
"""
import csv
import io
import os
import sqlite3
from datetime import date, datetime, timedelta
from functools import wraps

from flask import Flask, Response, g, jsonify, request, send_from_directory
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

from . import db as store
from .config import DEFAULTER_THRESHOLD, SECRET_KEY, TOKEN_MAX_AGE, WEB_DIST
from .recognizer import Recognizer, decode_image

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024
app.teardown_appcontext(store.close_db)

store.init_db()
recognizer = Recognizer()
signer = URLSafeTimedSerializer(SECRET_KEY, salt="auth")


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message, self.status = message, status


@app.errorhandler(ApiError)
def handle_api_error(err):
    return jsonify({"error": err.message}), err.status


# ---------------------------------------------------------------- auth

def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise ApiError("Not signed in.", 401)
    try:
        user_id = signer.loads(header[7:], max_age=TOKEN_MAX_AGE)
    except SignatureExpired:
        raise ApiError("Session expired. Sign in again.", 401)
    except BadSignature:
        raise ApiError("Invalid session.", 401)
    user = store.get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        raise ApiError("Account no longer exists.", 401)
    return user


def requires(role=None):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            g.user = current_user()
            if role and g.user["role"] != role:
                raise ApiError("You don't have access to this.", 403)
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def user_payload(user):
    payload = {"id": user["id"], "username": user["username"], "role": user["role"], "student": None}
    if user["student_id"]:
        payload["student"] = student_payload(
            store.get_db().execute("SELECT * FROM students WHERE id = ?", (user["student_id"],)).fetchone()
        )
    return payload


def student_payload(row):
    return {
        "id": row["id"],
        "roll_number": row["roll_number"],
        "name": row["name"],
        "department": row["department"],
        "enrolled": row["roll_number"] in recognizer.known_rolls,
    }


def body():
    return request.get_json(silent=True) or {}


@app.post("/api/auth/login")
def login():
    data = body()
    username = str(data.get("username", "")).strip()
    user = store.get_db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], str(data.get("password", ""))):
        raise ApiError("Wrong username or password.", 401)
    return jsonify({"token": signer.dumps(user["id"]), "user": user_payload(user)})


@app.get("/api/auth/me")
@requires()
def me():
    return jsonify(user_payload(g.user))


@app.post("/api/auth/password")
@requires()
def change_password():
    data = body()
    if not check_password_hash(g.user["password_hash"], str(data.get("current", ""))):
        raise ApiError("Current password is wrong.")
    new = str(data.get("new", ""))
    if len(new) < 6:
        raise ApiError("New password must be at least 6 characters.")
    db = store.get_db()
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(new), g.user["id"]))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------- shared helpers

def class_days(db):
    """Days on which at least one student was marked present."""
    return [r["date"] for r in db.execute("SELECT DISTINCT date FROM attendance ORDER BY date")]


def student_by_roll(db, roll):
    return db.execute("SELECT * FROM students WHERE roll_number = ?", (roll,)).fetchone()


def mark_faces(image, method, only_student_id=None):
    """Identify faces and mark matches present. Returns one result per detected face."""
    db = store.get_db()
    results = []
    for face in recognizer.identify(image):
        student = student_by_roll(db, face["roll"]) if face["roll"] else None
        result = {"box": face["box"], "status": "unknown", "student": None}
        if student is not None:
            result["student"] = student_payload(student)
            if only_student_id is not None and student["id"] != only_student_id:
                result["status"] = "mismatch"
            else:
                result["status"] = "marked" if store.mark(db, student["id"], method) else "already"
        results.append(result)
    db.commit()
    return results


# ---------------------------------------------------------------- admin: overview

@app.get("/api/stats")
@requires("admin")
def stats():
    db = store.get_db()
    today = date.today().isoformat()
    total = db.execute("SELECT COUNT(*) FROM students").fetchone()[0]
    present = db.execute("SELECT COUNT(*) FROM attendance WHERE date = ?", (today,)).fetchone()[0]
    days = class_days(db)

    start = date.today() - timedelta(days=13)
    counts = dict(db.execute(
        "SELECT date, COUNT(*) FROM attendance WHERE date >= ? GROUP BY date", (start.isoformat(),)
    ).fetchall())
    series = [
        {"date": (start + timedelta(days=i)).isoformat(), "count": counts.get((start + timedelta(days=i)).isoformat(), 0)}
        for i in range(14)
    ]

    recent = db.execute(
        """SELECT a.id, a.date, a.time, a.method, s.name, s.roll_number, s.department
           FROM attendance a JOIN students s ON s.id = a.student_id
           ORDER BY a.date DESC, a.time DESC LIMIT 8"""
    ).fetchall()

    students = student_rows(db)
    return jsonify({
        "total_students": total,
        "present_today": present,
        "class_days": len(days),
        "enrolled_faces": sum(1 for s in students if s["enrolled"]),
        "average_rate": round(sum(s["percent"] for s in students) / len(students)) if students else 0,
        "defaulters": sum(1 for s in students if s["defaulter"]),
        "series": series,
        "recent": [dict(r) for r in recent],
    })


# ---------------------------------------------------------------- admin: students

def student_rows(db):
    days = len(class_days(db))
    rows = db.execute(
        """SELECT s.*, COUNT(a.id) AS attended, MAX(a.date || ' ' || a.time) AS last_seen
           FROM students s LEFT JOIN attendance a ON a.student_id = s.id
           GROUP BY s.id ORDER BY s.roll_number"""
    ).fetchall()
    out = []
    for row in rows:
        percent = round(row["attended"] * 100 / days) if days else 0
        out.append({
            **student_payload(row),
            "attended": row["attended"],
            "class_days": days,
            "percent": percent,
            "defaulter": days > 0 and percent < DEFAULTER_THRESHOLD,
            "last_seen": row["last_seen"],
        })
    return out


@app.get("/api/students")
@requires("admin")
def list_students():
    return jsonify(student_rows(store.get_db()))


@app.post("/api/students")
@requires("admin")
def add_student():
    data = body()
    roll = str(data.get("roll_number", "")).strip()
    name = str(data.get("name", "")).strip()
    department = str(data.get("department", "")).strip()
    if not (roll and name and department):
        raise ApiError("Name, roll number and department are all required.")
    if not roll.isalnum():
        raise ApiError("Roll number can only contain letters and digits.")
    db = store.get_db()
    try:
        student_id = store.create_student(db, roll, name, department)
    except sqlite3.IntegrityError:
        raise ApiError(f"A student or user with roll number {roll} already exists.", 409)
    db.commit()
    return jsonify(student_payload(db.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone())), 201


@app.delete("/api/students/<int:student_id>")
@requires("admin")
def delete_student(student_id):
    db = store.get_db()
    student = db.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
    if student is None:
        raise ApiError("Student not found.", 404)
    db.execute("DELETE FROM students WHERE id = ?", (student_id,))
    db.commit()
    recognizer.forget(student["roll_number"])
    return jsonify({"ok": True})


@app.post("/api/students/<int:student_id>/faces")
@requires("admin")
def enroll_faces(student_id):
    student = store.get_db().execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
    if student is None:
        raise ApiError("Student not found.", 404)
    frames = body().get("images", [])
    if not frames:
        raise ApiError("Send at least one image.")
    added = recognizer.enroll(student["roll_number"], [decode_image(f) for f in frames])
    if added == 0:
        raise ApiError("Couldn't find exactly one clear face in any of those shots. Try better lighting.", 422)
    return jsonify({"added": added, "sent": len(frames)})


@app.post("/api/model/train")
@requires("admin")
def train():
    faces, people = recognizer.train()
    return jsonify({"faces": faces, "people": people})


# ---------------------------------------------------------------- admin: attendance

@app.get("/api/attendance")
@requires("admin")
def list_attendance():
    db = store.get_db()
    sql = """SELECT a.id, a.date, a.time, a.method, s.id AS student_id, s.name, s.roll_number, s.department
             FROM attendance a JOIN students s ON s.id = a.student_id WHERE 1 = 1"""
    params = []
    if request.args.get("date"):
        sql += " AND a.date = ?"
        params.append(request.args["date"])
    if request.args.get("q"):
        sql += " AND (s.name LIKE ? OR s.roll_number LIKE ?)"
        params += [f"%{request.args['q']}%"] * 2
    sql += " ORDER BY a.date DESC, a.time DESC"
    return jsonify([dict(r) for r in db.execute(sql, params)])


@app.post("/api/attendance")
@requires("admin")
def add_attendance():
    data = body()
    db = store.get_db()
    student = db.execute("SELECT id FROM students WHERE id = ?", (data.get("student_id"),)).fetchone()
    if student is None:
        raise ApiError("Student not found.", 404)
    try:
        when = datetime.strptime(data.get("date") or date.today().isoformat(), "%Y-%m-%d")
    except ValueError:
        raise ApiError("Date must look like YYYY-MM-DD.")
    if when.date() == date.today():
        when = datetime.now()
    if not store.mark(db, student["id"], "manual", when):
        raise ApiError("Already marked present for that day.", 409)
    db.commit()
    return jsonify({"ok": True}), 201


@app.delete("/api/attendance/<int:record_id>")
@requires("admin")
def delete_attendance(record_id):
    db = store.get_db()
    if db.execute("DELETE FROM attendance WHERE id = ?", (record_id,)).rowcount == 0:
        raise ApiError("Record not found.", 404)
    db.commit()
    return jsonify({"ok": True})


@app.get("/api/attendance/export")
@requires("admin")
def export_attendance():
    rows = store.get_db().execute(
        """SELECT s.name, s.roll_number, s.department, a.date, a.time, a.method
           FROM attendance a JOIN students s ON s.id = a.student_id ORDER BY a.date, a.time"""
    )
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Name", "Roll Number", "Department", "Date", "Time", "Method"])
    writer.writerows(rows)
    return Response(out.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=attendance.csv"})


# ---------------------------------------------------------------- scanning

@app.post("/api/scan")
@requires("admin")
def scan():
    """Kiosk mode: one webcam frame in, every recognised face marked present."""
    image = body().get("image")
    if not image:
        raise ApiError("No frame sent.")
    return jsonify({"faces": mark_faces(decode_image(image), "camera")})


@app.post("/api/scan/upload")
@requires("admin")
def scan_upload():
    """Group photo upload: mark everyone recognised in it."""
    file = request.files.get("file")
    if file is None or file.filename == "":
        raise ApiError("No photo uploaded.")
    return jsonify({"faces": mark_faces(decode_image(file.read()), "upload")})


# ---------------------------------------------------------------- student self-service

@app.get("/api/me/attendance")
@requires("student")
def my_attendance():
    db = store.get_db()
    days = class_days(db)
    records = [dict(r) for r in db.execute(
        "SELECT id, date, time, method FROM attendance WHERE student_id = ? ORDER BY date DESC",
        (g.user["student_id"],),
    )]
    attended = {r["date"] for r in records}

    streak = 0
    for day in reversed(days):
        if day not in attended:
            break
        streak += 1

    percent = round(len(attended) * 100 / len(days)) if days else 0
    return jsonify({
        "records": records,
        "class_days": days,
        "attended": len(attended),
        "percent": percent,
        "defaulter": bool(days) and percent < DEFAULTER_THRESHOLD,
        "threshold": DEFAULTER_THRESHOLD,
        "streak": streak,
        "present_today": date.today().isoformat() in attended,
    })


@app.post("/api/me/checkin")
@requires("student")
def self_checkin():
    """A student marks themself present; the face in frame has to be theirs."""
    image = body().get("image")
    if not image:
        raise ApiError("No frame sent.")
    faces = mark_faces(decode_image(image), "self", only_student_id=g.user["student_id"])
    return jsonify({"faces": faces})


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


# ---------------------------------------------------------------- frontend

@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def frontend(path):
    if path.startswith("api/"):
        raise ApiError("Not found.", 404)
    if not os.path.isdir(WEB_DIST):
        return "Frontend not built. Run `npm run build` in web/, or use `npm run dev` there.", 404
    if path and os.path.exists(os.path.join(WEB_DIST, path)):
        return send_from_directory(WEB_DIST, path)
    return send_from_directory(WEB_DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 10000)), debug=bool(os.environ.get("DEBUG")))
