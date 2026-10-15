"""Dashboard stats, staff accounts, the face model, unknown faces, audit log, alerts and search."""
import os
import sqlite3

import numpy as np
from flask import Blueprint, current_app, g, jsonify, request, send_from_directory
from PIL import Image

from .. import marking, notify, stats
from .. import db as store
from ..auth import STAFF, requires
from ..core import body, course_ids, get_student, qmarks, recognizer, student_payload
from ..errors import ApiError

bp = Blueprint("admin", __name__, url_prefix="/api")


@bp.get("/stats")
@requires(*STAFF)
def dashboard():
    db = store.get_db()
    return jsonify(stats.dashboard(db, course_ids(db, g.user), g.user["role"] == "admin"))


@bp.get("/search")
@requires(*STAFF)
def search():
    """Command palette: students and courses matching ?q."""
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"students": [], "courses": []})
    db = store.get_db()
    ids = course_ids(db, g.user)
    like = f"%{q}%"
    if g.user["role"] == "admin":
        students = db.execute(
            "SELECT * FROM students WHERE name LIKE ? OR roll_number LIKE ? ORDER BY name LIMIT 8", (like, like)
        ).fetchall()
    else:
        students = db.execute(
            f"""SELECT DISTINCT s.* FROM students s JOIN course_students cs ON cs.student_id = s.id
                WHERE cs.course_id IN ({qmarks(ids) if ids else 'NULL'}) AND (s.name LIKE ? OR s.roll_number LIKE ?)
                ORDER BY s.name LIMIT 8""",
            [*ids, like, like],
        ).fetchall()
    courses = db.execute(
        f"""SELECT id, code, name FROM courses WHERE id IN ({qmarks(ids) if ids else 'NULL'})
            AND (code LIKE ? OR name LIKE ?) ORDER BY code LIMIT 6""",
        [*ids, like, like],
    ).fetchall()
    return jsonify({"students": [student_payload(s) for s in students], "courses": [dict(c) for c in courses]})


# ---------------------------------------------------------------- staff accounts

@bp.get("/teachers")
@requires(*STAFF)
def list_teachers():
    db = store.get_db()
    rows = db.execute(
        """SELECT u.id, u.username, u.name, u.email, u.created_at,
                  (SELECT GROUP_CONCAT(code, ', ') FROM courses c WHERE c.teacher_id = u.id) AS courses
           FROM users u WHERE u.role = 'teacher' ORDER BY u.name"""
    )
    return jsonify([dict(r) for r in rows])


@bp.post("/teachers")
@requires("admin")
def create_teacher():
    data = body()
    username = str(data.get("username", "")).strip().lower()
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "") or "").strip() or None
    password = str(data.get("password", ""))
    if not (username and name):
        raise ApiError("Username and name are required.")
    if len(password) < 6:
        raise ApiError("Starting password must be at least 6 characters.")
    db = store.get_db()
    try:
        teacher_id = store.create_user(db, username, password, "teacher", name, email, must_change_password=True)
    except sqlite3.IntegrityError:
        raise ApiError(f"The username {username} is taken.", 409)
    store.audit(db, g.user, "teacher.create", username=username)
    db.commit()
    return jsonify({"id": teacher_id}), 201


@bp.delete("/teachers/<int:user_id>")
@requires("admin")
def delete_teacher(user_id):
    db = store.get_db()
    teacher = db.execute("SELECT * FROM users WHERE id = ? AND role = 'teacher'", (user_id,)).fetchone()
    if teacher is None:
        raise ApiError("Teacher not found.", 404)
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    store.audit(db, g.user, "teacher.delete", username=teacher["username"])
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------- face model

@bp.post("/model/train")
@requires("admin")
def train():
    db = store.get_db()
    rolls = {r[0] for r in db.execute("SELECT roll_number FROM students")}
    faces, people = recognizer().train(allowed_rolls=rolls)
    store.audit(db, g.user, "model.train", faces=faces, people=people)
    db.commit()
    return jsonify({"faces": faces, "people": people})


@bp.get("/unknown")
@requires("admin")
def list_unknown():
    db = store.get_db()
    rows = db.execute(
        """SELECT u.id, u.captured_at, u.session_id, s.date, c.code AS course_code
           FROM unknown_faces u LEFT JOIN sessions s ON s.id = u.session_id LEFT JOIN courses c ON c.id = s.course_id
           ORDER BY u.id DESC LIMIT 200"""
    )
    return jsonify([dict(r) for r in rows])


def _unknown(db, face_id):
    row = db.execute("SELECT * FROM unknown_faces WHERE id = ?", (face_id,)).fetchone()
    if row is None:
        raise ApiError("That face is gone.", 404)
    return row


def _drop_unknown(db, row):
    db.execute("DELETE FROM unknown_faces WHERE id = ?", (row["id"],))
    try:
        os.remove(os.path.join(current_app.config["UNKNOWN_DIR"], row["file"]))
    except FileNotFoundError:
        pass


@bp.get("/unknown/<int:face_id>/image")
@requires("admin")
def unknown_image(face_id):
    row = _unknown(store.get_db(), face_id)
    return send_from_directory(current_app.config["UNKNOWN_DIR"], row["file"], max_age=3600)


@bp.post("/unknown/<int:face_id>/assign")
@requires("admin")
def assign_unknown(face_id):
    """'That's Priya': teach the model this face and, optionally, mark her present in that class."""
    db = store.get_db()
    row = _unknown(db, face_id)
    data = body()
    student = get_student(db, data.get("student_id"))
    image = np.array(Image.open(os.path.join(current_app.config["UNKNOWN_DIR"], row["file"])).convert("RGB"))
    recognizer().add_face(student["roll_number"], image, np.frombuffer(row["encoding"], dtype=np.float64))
    marked = False
    if data.get("mark", True) and row["session_id"]:
        session = db.execute("SELECT * FROM sessions WHERE id = ?", (row["session_id"],)).fetchone()
        on_roster = db.execute(
            "SELECT 1 FROM course_students WHERE course_id = ? AND student_id = ?", (session["course_id"], student["id"])
        ).fetchone()
        if on_roster:
            marked = marking.mark(db, session, student["id"], "manual", time_str=row["captured_at"][11:19],
                                  marked_by=g.user["id"]) is not None
    _drop_unknown(db, row)
    store.audit(db, g.user, "face.assign", roll=student["roll_number"], marked=marked)
    db.commit()
    return jsonify({"ok": True, "marked": marked})


@bp.delete("/unknown/<int:face_id>")
@requires("admin")
def dismiss_unknown(face_id):
    db = store.get_db()
    _drop_unknown(db, _unknown(db, face_id))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------- audit and alerts

@bp.get("/audit")
@requires("admin")
def audit_log():
    db = store.get_db()
    sql, args = "SELECT * FROM audit_log", []
    if request.args.get("action"):
        sql += " WHERE action LIKE ?"
        args.append(request.args["action"] + "%")
    sql += " ORDER BY id DESC LIMIT 300"
    return jsonify([dict(r) for r in db.execute(sql, args)])


@bp.post("/alerts/defaulters")
@requires(*STAFF)
def alert_defaulters():
    """Email every defaulter in my courses. Without SMTP configured (or with dry_run) just preview."""
    db = store.get_db()
    ids = course_ids(db, g.user)
    summaries = stats.per_student(db, ids)
    messages, preview = [], []
    for sid, summary in sorted(summaries.items(), key=lambda kv: kv[1]["percent"] or 0):
        if not summary["defaulter"]:
            continue
        student = db.execute("SELECT * FROM students WHERE id = ?", (sid,)).fetchone()
        report = stats.student_report(db, sid, ids)
        subject, text = notify.defaulter_message(student, summary, report["courses"])
        preview.append({"name": student["name"], "roll_number": student["roll_number"], "email": student["email"],
                        "percent": summary["percent"], "subject": subject, "text": text})
        if student["email"]:
            messages.append((student["email"], subject, text))
    dry_run = bool(body().get("dry_run")) or not notify.configured()
    sent = 0
    if not dry_run and messages:
        try:
            sent = notify.send(messages)
        except Exception as e:  # SMTP failures shouldn't look like a server crash
            raise ApiError(f"Couldn't send email: {e}", 502)
        store.audit(db, g.user, "alerts.send", sent=sent)
        db.commit()
    return jsonify({"dry_run": dry_run, "smtp_configured": notify.configured(), "sent": sent, "preview": preview})
