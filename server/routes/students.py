import csv
import io
import sqlite3

from flask import Blueprint, g, jsonify, request, send_file
from werkzeug.security import generate_password_hash

from .. import db as store
from .. import stats
from ..auth import STAFF, requires
from ..core import body, can_view_student, course_ids, get_student, qmarks, recognizer, student_payload
from ..errors import ApiError
from ..recognizer import decode_image

bp = Blueprint("students", __name__, url_prefix="/api/students")


def _clean(data):
    roll = str(data.get("roll_number", "")).strip()
    name = str(data.get("name", "")).strip()
    department = str(data.get("department", "")).strip()
    email = str(data.get("email", "") or "").strip() or None
    if not (roll and name and department):
        raise ApiError("Name, roll number and department are all required.")
    if not roll.isalnum():
        raise ApiError("Roll number can only contain letters and digits.")
    if email and "@" not in email:
        raise ApiError("That email address doesn't look right.")
    return roll, name, department, email


def _set_courses(db, student_id, ids):
    valid = {r[0] for r in db.execute("SELECT id FROM courses")}
    db.execute("DELETE FROM course_students WHERE student_id = ?", (student_id,))
    db.executemany(
        "INSERT INTO course_students (course_id, student_id) VALUES (?, ?)",
        [(int(c), student_id) for c in ids if int(c) in valid],
    )


@bp.get("")
@requires(*STAFF)
def list_students():
    db = store.get_db()
    ids = course_ids(db, g.user)
    if g.user["role"] == "admin":
        rows = db.execute("SELECT * FROM students ORDER BY roll_number").fetchall()
    else:
        rows = db.execute(
            f"""SELECT DISTINCT s.* FROM students s JOIN course_students cs ON cs.student_id = s.id
                WHERE cs.course_id IN ({qmarks(ids) if ids else 'NULL'}) ORDER BY s.roll_number""",
            ids,
        ).fetchall()
    summaries = stats.per_student(db, ids)
    last_seen = dict(db.execute(
        """SELECT a.student_id, MAX(s.date || ' ' || a.time) FROM attendance a
           JOIN sessions s ON s.id = a.session_id WHERE a.status != 'excused' GROUP BY a.student_id"""
    ).fetchall())
    enrolled_in = {}
    for r in db.execute(
        "SELECT cs.student_id, c.id, c.code FROM course_students cs JOIN courses c ON c.id = cs.course_id ORDER BY c.code"
    ):
        enrolled_in.setdefault(r["student_id"], []).append({"id": r["id"], "code": r["code"]})
    return jsonify([
        {
            **student_payload(r),
            **summaries.get(r["id"], stats.summarize()),
            "last_seen": last_seen.get(r["id"]),
            "courses": enrolled_in.get(r["id"], []),
        }
        for r in rows
    ])


@bp.post("")
@requires("admin")
def add_student():
    data = body()
    roll, name, department, email = _clean(data)
    db = store.get_db()
    try:
        student_id = store.create_student(db, roll, name, department, email)
    except sqlite3.IntegrityError:
        raise ApiError(f"A student or user with roll number {roll} already exists.", 409)
    _set_courses(db, student_id, data.get("course_ids") or [])
    store.audit(db, g.user, "student.create", roll=roll, name=name)
    db.commit()
    return jsonify(student_payload(get_student(db, student_id))), 201


@bp.post("/import")
@requires("admin")
def import_students():
    """Bulk add from a CSV with columns name, roll_number, department[, email][, courses]."""
    file = request.files.get("file")
    if file is None:
        raise ApiError("Upload a CSV file.")
    try:
        text = file.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ApiError("That file isn't UTF-8 text. Save it as CSV and try again.")
    reader = csv.DictReader(io.StringIO(text))
    headers = {(h or "").strip().lower().replace(" ", "_") for h in reader.fieldnames or []}
    if not {"name", "roll_number", "department"} <= headers:
        raise ApiError("The CSV needs name, roll_number and department columns.")

    db = store.get_db()
    by_code = {r["code"].upper(): r["id"] for r in db.execute("SELECT id, code FROM courses")}
    created, skipped = [], []
    for line, raw in enumerate(reader, start=2):
        row = {(k or "").strip().lower().replace(" ", "_"): (v or "").strip() for k, v in raw.items()}
        try:
            roll, name, department, email = _clean(row)
            with db:  # each row commits or rolls back on its own
                student_id = store.create_student(db, roll, name, department, email)
                codes = [c.strip().upper() for c in row.get("courses", "").replace(",", ";").split(";") if c.strip()]
                _set_courses(db, student_id, [by_code[c] for c in codes if c in by_code])
            created.append(roll)
        except ApiError as e:
            skipped.append({"line": line, "reason": e.message})
        except sqlite3.IntegrityError:
            skipped.append({"line": line, "reason": f"Roll number {row.get('roll_number')} already exists."})
    store.audit(db, g.user, "student.import", created=len(created), skipped=len(skipped))
    db.commit()
    return jsonify({"created": created, "skipped": skipped})


@bp.get("/<int:student_id>")
@requires(*STAFF)
def student_detail(student_id):
    db = store.get_db()
    student = get_student(db, student_id)
    if not can_view_student(db, g.user, student_id):
        raise ApiError("That student isn't in your classes.", 403)
    ids = course_ids(db, g.user)
    return jsonify({"student": student_payload(student), **stats.student_report(db, student_id, ids)})


@bp.patch("/<int:student_id>")
@requires("admin")
def update_student(student_id):
    db = store.get_db()
    student = get_student(db, student_id)
    data = body()
    merged = {**dict(student), **{k: v for k, v in data.items() if k in ("name", "department", "email")}}
    _roll, name, department, email = _clean(merged)
    db.execute("UPDATE students SET name = ?, department = ?, email = ? WHERE id = ?", (name, department, email, student_id))
    db.execute("UPDATE users SET name = ?, email = ? WHERE student_id = ?", (name, email, student_id))
    if "course_ids" in data:
        _set_courses(db, student_id, data["course_ids"] or [])
    store.audit(db, g.user, "student.update", roll=student["roll_number"])
    db.commit()
    return jsonify(student_payload(get_student(db, student_id)))


@bp.delete("/<int:student_id>")
@requires("admin")
def delete_student(student_id):
    db = store.get_db()
    student = get_student(db, student_id)
    db.execute("DELETE FROM students WHERE id = ?", (student_id,))
    store.audit(db, g.user, "student.delete", roll=student["roll_number"], name=student["name"])
    db.commit()
    recognizer().forget(student["roll_number"])
    return jsonify({"ok": True})


@bp.post("/<int:student_id>/reset-password")
@requires("admin")
def reset_password(student_id):
    db = store.get_db()
    student = get_student(db, student_id)
    db.execute(
        """UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1
           WHERE student_id = ?""",
        (generate_password_hash(student["roll_number"]), student_id),
    )
    store.audit(db, g.user, "student.reset_password", roll=student["roll_number"])
    db.commit()
    return jsonify({"ok": True})


@bp.post("/<int:student_id>/faces")
@requires("admin")
def enroll_faces(student_id):
    db = store.get_db()
    student = get_student(db, student_id)
    frames = body().get("images", [])
    if not frames:
        raise ApiError("Send at least one image.")
    added = recognizer().enroll(student["roll_number"], [decode_image(f) for f in frames])
    if added == 0:
        raise ApiError("Couldn't find exactly one clear face in any of those shots. Try better lighting.", 422)
    store.audit(db, g.user, "face.enroll", roll=student["roll_number"], added=added)
    db.commit()
    return jsonify({"added": added, "sent": len(frames)})


@bp.get("/<int:student_id>/photo")
@requires()
def photo(student_id):
    db = store.get_db()
    student = get_student(db, student_id)
    if not can_view_student(db, g.user, student_id):
        raise ApiError("Not allowed.", 403)
    path = recognizer().photo_path(student["roll_number"])
    if path is None:
        raise ApiError("No photo yet.", 404)
    response = send_file(path, max_age=3600)
    response.headers["Cache-Control"] = "private, max-age=3600"
    return response
