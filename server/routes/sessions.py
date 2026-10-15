from flask import Blueprint, g, jsonify, request

from .. import clock, codes, marking
from .. import db as store
from ..auth import STAFF, requires
from ..core import body, course_ids, get_session, qmarks, session_payload, student_payload
from ..errors import ApiError
from ..recognizer import decode_image
from .courses import can_run

bp = Blueprint("sessions", __name__, url_prefix="/api/sessions")


def _runnable(db, session_id):
    session = get_session(db, g.user, session_id)
    if not can_run(g.user, {"teacher_id": session["teacher_id"]}):
        raise ApiError("Only this course's teacher can run its classes.", 403)
    return session


def _open(db, session_id):
    session = _runnable(db, session_id)
    if session["status"] != "open":
        raise ApiError("This class has ended. Reopen it to keep taking attendance.", 409)
    return session


@bp.get("")
@requires(*STAFF)
def list_sessions():
    db = store.get_db()
    ids = course_ids(db, g.user)
    if not ids:
        return jsonify([])
    sql = f"""SELECT s.*, c.code AS course_code, c.name AS course_name,
                     (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status IN ('present', 'late')) AS here,
                     (SELECT COUNT(*) FROM course_students cs WHERE cs.course_id = s.course_id) AS roster
              FROM sessions s JOIN courses c ON c.id = s.course_id
              WHERE s.course_id IN ({qmarks(ids)})"""
    args = list(ids)
    for key, column in (("date", "s.date"), ("status", "s.status"), ("course_id", "s.course_id")):
        if request.args.get(key):
            sql += f" AND {column} = ?"
            args.append(request.args[key])
    sql += " ORDER BY s.date DESC, s.start_time DESC LIMIT 200"
    return jsonify([
        {**session_payload(s), "present": s["here"], "roster": s["roster"]} for s in db.execute(sql, args)
    ])


@bp.get("/<int:session_id>")
@requires(*STAFF)
def session_detail(session_id):
    """The live class view: roster with everyone's status, counts, and the current check-in code."""
    db = store.get_db()
    session = get_session(db, g.user, session_id)
    marks = {
        r["student_id"]: r
        for r in db.execute("SELECT * FROM attendance WHERE session_id = ?", (session_id,))
    }
    roster = []
    for s in db.execute(
        """SELECT s.* FROM students s JOIN course_students cs ON cs.student_id = s.id
           WHERE cs.course_id = ? ORDER BY s.name""",
        (session["course_id"],),
    ):
        m = marks.get(s["id"])
        roster.append({
            "student": student_payload(s),
            "status": m["status"] if m else ("absent" if session["status"] == "closed" else "waiting"),
            "time": m["time"] if m else None,
            "method": m["method"] if m else None,
            "similarity": round(m["confidence"] * 100) if m and m["confidence"] is not None else None,
        })
    tally = {k: sum(1 for r in roster if r["status"] == k) for k in ("present", "late", "excused", "absent", "waiting")}
    payload = {
        **session_payload(session),
        "can_run": can_run(g.user, {"teacher_id": session["teacher_id"]}),
        "roster": roster,
        "counts": tally,
        "unknown_faces": db.execute("SELECT COUNT(*) FROM unknown_faces WHERE session_id = ?", (session_id,)).fetchone()[0],
        "code": None,
        "code_expires_in": None,
        "server_time": clock.now().strftime("%H:%M:%S"),
    }
    if session["status"] == "open" and payload["can_run"]:
        payload["code"], payload["code_expires_in"] = codes.current(session["secret"])
    return jsonify(payload)


@bp.post("/<int:session_id>/close")
@requires(*STAFF)
def close_session(session_id):
    db = store.get_db()
    session = _runnable(db, session_id)
    db.execute("UPDATE sessions SET status = 'closed', closed_at = ? WHERE id = ?", (clock.stamp(), session_id))
    store.audit(db, g.user, "session.close", code=session["course_code"], session=session_id)
    db.commit()
    return jsonify({"ok": True})


@bp.post("/<int:session_id>/reopen")
@requires(*STAFF)
def reopen_session(session_id):
    db = store.get_db()
    session = _runnable(db, session_id)
    open_now = db.execute(
        "SELECT id FROM sessions WHERE course_id = ? AND status = 'open' AND id != ?", (session["course_id"], session_id)
    ).fetchone()
    if open_now:
        raise ApiError("Another class of this course is running. End it first.", 409)
    db.execute("UPDATE sessions SET status = 'open', closed_at = NULL WHERE id = ?", (session_id,))
    store.audit(db, g.user, "session.reopen", code=session["course_code"], session=session_id)
    db.commit()
    return jsonify({"ok": True})


@bp.delete("/<int:session_id>")
@requires("admin")
def delete_session(session_id):
    db = store.get_db()
    session = get_session(db, g.user, session_id)
    db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    store.audit(db, g.user, "session.delete", code=session["course_code"], date=session["date"])
    db.commit()
    return jsonify({"ok": True})


@bp.post("/<int:session_id>/scan")
@requires(*STAFF)
def scan(session_id):
    """Kiosk mode: one webcam frame in, every recognised face on the roster marked."""
    db = store.get_db()
    session = _open(db, session_id)
    image = body().get("image")
    if not image:
        raise ApiError("No frame sent.")
    return jsonify({"faces": marking.scan(db, session, decode_image(image), "camera", g.user)})


@bp.post("/<int:session_id>/scan/upload")
@requires(*STAFF)
def scan_upload(session_id):
    """Group photo: mark everyone recognised in it."""
    db = store.get_db()
    session = _open(db, session_id)
    file = request.files.get("file")
    if file is None or file.filename == "":
        raise ApiError("No photo uploaded.")
    try:
        image = decode_image(file.read())
    except Exception:
        raise ApiError("That file isn't an image we can read.")
    return jsonify({"faces": marking.scan(db, session, image, "upload", g.user)})


@bp.put("/<int:session_id>/attendance/<int:student_id>")
@requires(*STAFF)
def set_status(session_id, student_id):
    """Manual override: present / late / excused / absent."""
    db = store.get_db()
    session = _runnable(db, session_id)
    status = body().get("status")
    if status not in ("present", "late", "excused", "absent"):
        raise ApiError("Status must be present, late, excused or absent.")
    if not db.execute(
        "SELECT 1 FROM course_students WHERE course_id = ? AND student_id = ?", (session["course_id"], student_id)
    ).fetchone():
        raise ApiError("That student isn't on this course's roster.", 404)
    before = db.execute(
        "SELECT status FROM attendance WHERE session_id = ? AND student_id = ?", (session_id, student_id)
    ).fetchone()
    if status == "absent":
        db.execute("DELETE FROM attendance WHERE session_id = ? AND student_id = ?", (session_id, student_id))
    else:
        time_str = clock.now().strftime("%H:%M:%S") if session["date"] == clock.today().isoformat() else session["start_time"]
        db.execute(
            """INSERT INTO attendance (session_id, student_id, status, method, time, marked_by)
               VALUES (?, ?, ?, 'manual', ?, ?)
               ON CONFLICT (session_id, student_id) DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by""",
            (session_id, student_id, status, time_str, g.user["id"]),
        )
    roll = db.execute("SELECT roll_number FROM students WHERE id = ?", (student_id,)).fetchone()
    store.audit(db, g.user, "attendance.set", code=session["course_code"], date=session["date"],
                roll=roll["roll_number"] if roll else student_id,
                before=before["status"] if before else "absent", after=status)
    db.commit()
    return jsonify({"ok": True})
