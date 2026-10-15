"""Student self-service: my attendance, open classes, self check-in and requests."""
from flask import Blueprint, g, jsonify

from .. import clock, codes, marking, stats
from .. import db as store
from ..auth import Throttle, requires
from ..config import CODE_STEP_SECONDS, LIVENESS, MAX_CODE_ATTEMPTS
from ..core import body, course_ids, qmarks, recognizer, session_payload
from ..errors import ApiError
from ..recognizer import decode_image
from .requests import SELECT, payload

bp = Blueprint("me", __name__, url_prefix="/api/me")

# Wrong classroom codes per (session, student). Stops guessing a 4-digit code.
code_throttle = Throttle(MAX_CODE_ATTEMPTS, 60 * 60)


def _open_sessions(db):
    ids = course_ids(db, g.user)
    if not ids:
        return []
    rows = db.execute(
        f"""SELECT s.*, c.code AS course_code, c.name AS course_name, u.name AS teacher_name, a.status AS my_status
            FROM sessions s JOIN courses c ON c.id = s.course_id LEFT JOIN users u ON u.id = c.teacher_id
            LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = ?
            WHERE s.status = 'open' AND s.course_id IN ({qmarks(ids)}) ORDER BY s.start_time""",
        [g.user["student_id"], *ids],
    )
    return [{**session_payload(r), "teacher_name": r["teacher_name"], "my_status": r["my_status"]} for r in rows]


@bp.get("/attendance")
@requires("student")
def my_attendance():
    db = store.get_db()
    report = stats.student_report(db, g.user["student_id"], course_ids(db, g.user))
    return jsonify({**report, "open_sessions": _open_sessions(db), "liveness": LIVENESS,
                    "code_step": CODE_STEP_SECONDS})


@bp.post("/checkin")
@requires("student")
def self_checkin():
    """Mark myself present: needs an open class, the code on the classroom screen and my live face."""
    db = store.get_db()
    data = body()
    session = db.execute(
        """SELECT s.*, c.code AS course_code FROM sessions s JOIN courses c ON c.id = s.course_id
           WHERE s.id = ?""",
        (data.get("session_id"),),
    ).fetchone()
    if session is None or session["course_id"] not in course_ids(db, g.user):
        raise ApiError("That class isn't one of yours.", 404)
    if session["status"] != "open":
        raise ApiError("That class isn't taking attendance any more.", 409)

    student_id = g.user["student_id"]
    existing = db.execute(
        "SELECT status FROM attendance WHERE session_id = ? AND student_id = ?", (session["id"], student_id)
    ).fetchone()
    if existing:
        return jsonify({"status": "already", "late": existing["status"] == "late", "box": None, "similarity": None})

    key = f"{session['id']}:{student_id}"
    code_throttle.check(key)
    if not codes.verify(session["secret"], data.get("code", "")):
        code_throttle.fail(key)
        raise ApiError("That code doesn't match the one on the classroom screen. It changes every 30 seconds.", 403)

    frames = data.get("frames") or ([data["image"]] if data.get("image") else [])
    if not frames:
        raise ApiError("No camera frames sent.")
    images = [decode_image(f) for f in frames[:16]]
    me = db.execute("SELECT roll_number FROM students WHERE id = ?", (student_id,)).fetchone()

    if LIVENESS:
        check = recognizer().check_liveness(images)
        if check["faces"] == 0:
            raise ApiError("Couldn't see a face. Face the camera in good light.", 422)
        if not check["blinked"]:
            raise ApiError("We need to see you blink, so we know it's really you and not a photo. Try again.", 422)
        roll, distance, box = check["roll"], check["distance"], check["box"]
    else:
        faces = recognizer().identify(images[0])
        if not faces:
            raise ApiError("Couldn't see a face. Face the camera in good light.", 422)
        face = max(faces, key=lambda f: (f["box"]["right"] - f["box"]["left"]))
        roll, distance, box = face["roll"], face["distance"], face["box"]

    if roll != me["roll_number"]:
        raise ApiError("That face doesn't match your enrolled face. Only you can check yourself in.", 403)

    status = marking.mark(db, session, student_id, "self", confidence=1 - distance)
    db.commit()
    return jsonify({
        "status": "marked" if status else "already",
        "late": status == "late",
        "box": box,
        "similarity": marking.similarity(distance),
    })


@bp.get("/requests")
@requires("student")
def my_requests():
    db = store.get_db()
    rows = db.execute(SELECT + " WHERE r.student_id = ? ORDER BY r.created_at DESC", (g.user["student_id"],))
    return jsonify([payload(r) for r in rows])


@bp.post("/requests")
@requires("student")
def create_request():
    db = store.get_db()
    data = body()
    kind = data.get("kind")
    reason = str(data.get("reason", "")).strip()
    if kind not in ("leave", "correction"):
        raise ApiError("Pick leave or correction.")
    if len(reason) < 5:
        raise ApiError("Give a short reason (at least 5 characters).")
    session = db.execute("SELECT * FROM sessions WHERE id = ?", (data.get("session_id"),)).fetchone()
    if session is None or session["course_id"] not in course_ids(db, g.user):
        raise ApiError("That class isn't one of yours.", 404)
    student_id = g.user["student_id"]
    marked = db.execute(
        "SELECT status FROM attendance WHERE session_id = ? AND student_id = ?", (session["id"], student_id)
    ).fetchone()
    if marked and marked["status"] != "late":
        raise ApiError("You're not marked absent for that class.", 409)
    if marked and kind == "leave":
        raise ApiError("You were there (late). Ask for a correction instead.", 409)
    if session["status"] == "open" and not marked:
        raise ApiError("That class is still running. Check in, or ask once it has ended.", 409)
    if db.execute(
        "SELECT 1 FROM requests WHERE session_id = ? AND student_id = ? AND status = 'pending'", (session["id"], student_id)
    ).fetchone():
        raise ApiError("You already have a pending request for that class.", 409)
    cur = db.execute(
        "INSERT INTO requests (student_id, session_id, kind, reason, created_at) VALUES (?, ?, ?, ?, ?)",
        (student_id, session["id"], kind, reason[:500], clock.stamp()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid}), 201


@bp.delete("/requests/<int:request_id>")
@requires("student")
def cancel_request(request_id):
    db = store.get_db()
    cur = db.execute(
        "DELETE FROM requests WHERE id = ? AND student_id = ? AND status = 'pending'", (request_id, g.user["student_id"])
    )
    if cur.rowcount == 0:
        raise ApiError("No pending request like that.", 404)
    db.commit()
    return jsonify({"ok": True})
