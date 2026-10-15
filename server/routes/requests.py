"""Leave and correction requests: students ask, the course's teacher (or an admin) decides."""
from flask import Blueprint, g, jsonify, request

from .. import clock
from .. import db as store
from ..auth import STAFF, requires
from ..core import body, course_ids, qmarks
from ..errors import ApiError
from .courses import can_run

bp = Blueprint("requests", __name__, url_prefix="/api/requests")

SELECT = """
    SELECT r.*, s.date, s.start_time, s.topic, s.course_id, c.code AS course_code, c.name AS course_name, c.teacher_id,
           st.name, st.roll_number, u.name AS decided_by_name
    FROM requests r
    JOIN sessions s ON s.id = r.session_id
    JOIN courses c ON c.id = s.course_id
    JOIN students st ON st.id = r.student_id
    LEFT JOIN users u ON u.id = r.decided_by
"""

FIELDS = ("id", "kind", "reason", "status", "note", "created_at", "decided_at", "decided_by_name", "session_id",
          "date", "start_time", "topic", "course_id", "course_code", "course_name", "student_id", "name", "roll_number")


def payload(row):
    return {k: row[k] for k in FIELDS}


@bp.get("")
@requires(*STAFF)
def list_requests():
    db = store.get_db()
    ids = course_ids(db, g.user)
    if not ids:
        return jsonify([])
    sql = SELECT + f" WHERE s.course_id IN ({qmarks(ids)})"
    args = list(ids)
    if request.args.get("status"):
        sql += " AND r.status = ?"
        args.append(request.args["status"])
    sql += " ORDER BY r.status = 'pending' DESC, r.created_at DESC LIMIT 300"
    return jsonify([payload(r) for r in db.execute(sql, args)])


@bp.post("/<int:request_id>/decide")
@requires(*STAFF)
def decide(request_id):
    db = store.get_db()
    row = db.execute(SELECT + " WHERE r.id = ?", (request_id,)).fetchone()
    if row is None or row["course_id"] not in course_ids(db, g.user):
        raise ApiError("Request not found.", 404)
    if not can_run(g.user, row):
        raise ApiError("Only this course's teacher can decide.", 403)
    if row["status"] != "pending":
        raise ApiError("That request was already decided.", 409)
    data = body()
    approve = bool(data.get("approve"))
    note = str(data.get("note", "")).strip()[:300] or None
    db.execute(
        "UPDATE requests SET status = ?, note = ?, decided_by = ?, decided_at = ? WHERE id = ?",
        ("approved" if approve else "rejected", note, g.user["id"], clock.stamp(), request_id),
    )
    if approve:
        # Leave -> excused (doesn't count against them). Correction -> present.
        status = "excused" if row["kind"] == "leave" else "present"
        db.execute(
            """INSERT INTO attendance (session_id, student_id, status, method, time, marked_by)
               VALUES (?, ?, ?, 'request', ?, ?)
               ON CONFLICT (session_id, student_id) DO UPDATE SET status = excluded.status, method = 'request',
                   marked_by = excluded.marked_by""",
            (row["session_id"], row["student_id"], status, row["start_time"], g.user["id"]),
        )
    store.audit(db, g.user, "request.approve" if approve else "request.reject", kind=row["kind"],
                roll=row["roll_number"], code=row["course_code"], date=row["date"])
    db.commit()
    return jsonify({"ok": True})
