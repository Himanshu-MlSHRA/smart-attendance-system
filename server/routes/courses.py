import csv
import io
import sqlite3
from datetime import timedelta

from flask import Blueprint, Response, g, jsonify

from .. import clock, stats
from .. import db as store
from ..auth import STAFF, requires
from ..config import LATE_AFTER_MINUTES
from ..core import body, course_ids, course_payload, get_course, qmarks, session_payload, student_payload
from ..errors import ApiError

bp = Blueprint("courses", __name__, url_prefix="/api/courses")


def _teacher_id(db, value):
    if value in (None, "", 0):
        return None
    teacher = db.execute("SELECT id FROM users WHERE id = ? AND role = 'teacher'", (value,)).fetchone()
    if teacher is None:
        raise ApiError("Pick a teacher from the list.")
    return teacher["id"]


def can_run(user, course):
    """Admins run any class; teachers only their own."""
    return user["role"] == "admin" or course["teacher_id"] == user["id"]


@bp.get("")
@requires()
def list_courses():
    db = store.get_db()
    ids = course_ids(db, g.user)
    if not ids:
        return jsonify([])
    rows = db.execute(
        f"""SELECT c.*, u.name AS teacher_name,
                   (SELECT COUNT(*) FROM course_students cs WHERE cs.course_id = c.id) AS students,
                   (SELECT COUNT(*) FROM sessions s WHERE s.course_id = c.id AND s.status = 'closed') AS sessions,
                   (SELECT id FROM sessions s WHERE s.course_id = c.id AND s.status = 'open' ORDER BY s.id DESC LIMIT 1) AS open_session_id
            FROM courses c LEFT JOIN users u ON u.id = c.teacher_id
            WHERE c.id IN ({qmarks(ids)}) ORDER BY c.code""",
        ids,
    ).fetchall()
    summaries = stats.counts(db, ids)
    out = []
    for r in rows:
        att = held = 0
        for (_sid, cid), c in summaries.items():
            if cid == r["id"]:
                att += c["present"] + c["late"]
                held += c["present"] + c["late"] + c["absent"]
        out.append({
            **course_payload(r),
            "students": r["students"],
            "sessions": r["sessions"],
            "open_session_id": r["open_session_id"],
            "rate": round(att * 100 / held) if held else None,
        })
    return jsonify(out)


@bp.post("")
@requires("admin")
def create_course():
    data = body()
    code = str(data.get("code", "")).strip().upper()
    name = str(data.get("name", "")).strip()
    department = str(data.get("department", "")).strip()
    if not (code and name and department):
        raise ApiError("Code, name and department are required.")
    db = store.get_db()
    teacher_id = _teacher_id(db, data.get("teacher_id"))
    try:
        cur = db.execute(
            "INSERT INTO courses (code, name, department, teacher_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (code, name, department, teacher_id, clock.stamp()),
        )
    except sqlite3.IntegrityError:
        raise ApiError(f"Course {code} already exists.", 409)
    # Start with everyone from the same department on the roster.
    if data.get("enroll_department", True):
        db.execute(
            "INSERT INTO course_students (course_id, student_id) SELECT ?, id FROM students WHERE department = ?",
            (cur.lastrowid, department),
        )
    store.audit(db, g.user, "course.create", code=code)
    db.commit()
    return jsonify({"id": cur.lastrowid}), 201


@bp.get("/<int:course_id>")
@requires(*STAFF)
def course_detail(course_id):
    db = store.get_db()
    course = get_course(db, g.user, course_id)
    teacher = db.execute("SELECT name FROM users WHERE id = ?", (course["teacher_id"],)).fetchone()
    c = stats.counts(db, [course_id])
    roster = [
        {**student_payload(s), **stats.summarize(**c.get((s["id"], course_id), {}))}
        for s in db.execute(
            """SELECT s.* FROM students s JOIN course_students cs ON cs.student_id = s.id
               WHERE cs.course_id = ? ORDER BY s.roll_number""",
            (course_id,),
        )
    ]
    sessions = [
        {**session_payload(s), "present": s["here"], "late": s["late"], "excused": s["excused"]}
        for s in db.execute(
            """SELECT s.*,
                      (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status IN ('present', 'late')) AS here,
                      (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status = 'late') AS late,
                      (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status = 'excused') AS excused
               FROM sessions s WHERE s.course_id = ? ORDER BY s.date DESC, s.start_time DESC""",
            (course_id,),
        )
    ]
    return jsonify({
        **course_payload(course),
        "teacher_name": teacher["name"] if teacher else None,
        "can_run": can_run(g.user, course),
        "roster": roster,
        "sessions": sessions,
        "threshold": stats.DEFAULTER_THRESHOLD,
    })


@bp.patch("/<int:course_id>")
@requires("admin")
def update_course(course_id):
    db = store.get_db()
    course = get_course(db, g.user, course_id)
    data = body()
    name = str(data.get("name", course["name"])).strip()
    department = str(data.get("department", course["department"])).strip()
    teacher_id = _teacher_id(db, data["teacher_id"]) if "teacher_id" in data else course["teacher_id"]
    if not (name and department):
        raise ApiError("Name and department can't be empty.")
    db.execute(
        "UPDATE courses SET name = ?, department = ?, teacher_id = ? WHERE id = ?", (name, department, teacher_id, course_id)
    )
    store.audit(db, g.user, "course.update", code=course["code"])
    db.commit()
    return jsonify({"ok": True})


@bp.put("/<int:course_id>/students")
@requires("admin")
def set_roster(course_id):
    db = store.get_db()
    course = get_course(db, g.user, course_id)
    wanted = {int(i) for i in body().get("student_ids", [])}
    valid = {r[0] for r in db.execute("SELECT id FROM students")}
    db.execute("DELETE FROM course_students WHERE course_id = ?", (course_id,))
    db.executemany("INSERT INTO course_students VALUES (?, ?)", [(course_id, s) for s in wanted & valid])
    store.audit(db, g.user, "course.roster", code=course["code"], students=len(wanted & valid))
    db.commit()
    return jsonify({"students": len(wanted & valid)})


@bp.delete("/<int:course_id>")
@requires("admin")
def delete_course(course_id):
    db = store.get_db()
    course = get_course(db, g.user, course_id)
    db.execute("DELETE FROM courses WHERE id = ?", (course_id,))
    store.audit(db, g.user, "course.delete", code=course["code"])
    db.commit()
    return jsonify({"ok": True})


@bp.post("/<int:course_id>/sessions")
@requires(*STAFF)
def start_session(course_id):
    """Open a class right now. Students can then be scanned or check themselves in."""
    db = store.get_db()
    course = get_course(db, g.user, course_id)
    if not can_run(g.user, course):
        raise ApiError("Only this course's teacher can start its classes.", 403)
    already = db.execute("SELECT id FROM sessions WHERE course_id = ? AND status = 'open'", (course_id,)).fetchone()
    if already:
        raise ApiError("This course already has a class running.", 409)
    data = body()
    duration = max(10, min(int(data.get("duration", 60) or 60), 240))
    late_after = max(0, min(int(data.get("late_after", LATE_AFTER_MINUTES) or 0), 120))
    start = clock.now()
    session_id = store.create_session(
        db, course_id, start.date().isoformat(), start.strftime("%H:%M:%S"),
        (start + timedelta(minutes=duration)).strftime("%H:%M:%S"),
        topic=str(data.get("topic", "")).strip()[:120], late_after=late_after, opened_by=g.user["id"],
    )
    store.audit(db, g.user, "session.start", code=course["code"], session=session_id)
    db.commit()
    return jsonify({"id": session_id}), 201


@bp.get("/<int:course_id>/report.csv")
@requires(*STAFF)
def course_report(course_id):
    """Attendance register: one row per student, one column per class (P / L / E / A)."""
    db = store.get_db()
    course = get_course(db, g.user, course_id)
    sessions = db.execute(
        "SELECT * FROM sessions WHERE course_id = ? AND status = 'closed' ORDER BY date, start_time", (course_id,)
    ).fetchall()
    marks = {
        (r["student_id"], r["session_id"]): r["status"]
        for r in db.execute(
            f"SELECT student_id, session_id, status FROM attendance WHERE session_id IN ({qmarks(sessions) or 'NULL'})",
            [s["id"] for s in sessions],
        )
    }
    letter = {"present": "P", "late": "L", "excused": "E"}
    c = stats.counts(db, [course_id])
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Roll Number", "Name", *[f"{s['date']} {s['start_time'][:5]}" for s in sessions],
                "Attended", "Held", "Percent", "Defaulter"])
    for st in db.execute(
        """SELECT s.* FROM students s JOIN course_students cs ON cs.student_id = s.id
           WHERE cs.course_id = ? ORDER BY s.roll_number""",
        (course_id,),
    ):
        summary = stats.summarize(**c.get((st["id"], course_id), {}))
        w.writerow([
            st["roll_number"], st["name"], *[letter.get(marks.get((st["id"], s["id"])), "A") for s in sessions],
            summary["attended"], summary["held"],
            "" if summary["percent"] is None else summary["percent"], "yes" if summary["defaulter"] else "",
        ])
    filename = f"{course['code']}-register-{clock.now():%Y%m%d}.csv"
    return Response(out.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})
