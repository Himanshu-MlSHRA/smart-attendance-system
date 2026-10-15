import csv
import io

from flask import Blueprint, Response, g, jsonify, request

from .. import clock, stats
from .. import db as store
from ..auth import STAFF, requires
from ..core import course_ids
from ..errors import ApiError

bp = Blueprint("records", __name__, url_prefix="/api/attendance")

LIMIT = 1000


def _rows():
    """The register, including absences, filtered by ?course_id, from, to, status, q."""
    db = store.get_db()
    ids = course_ids(db, g.user)
    if request.args.get("course_id"):
        wanted = int(request.args["course_id"])
        if wanted not in ids:
            raise ApiError("That isn't one of your courses.", 403)
        ids = [wanted]
    rows = stats.history(db, ids, since=request.args.get("from") or None)
    until = request.args.get("to")
    status = request.args.get("status")
    q = (request.args.get("q") or "").strip().lower()
    names = {r["id"]: r for r in db.execute("SELECT id, name, roll_number, department FROM students")}
    out = []
    for r in reversed(rows):  # newest first
        if until and r["date"] > until:
            continue
        if status and r["status"] != status:
            continue
        s = names.get(r["student_id"])
        if s is None or (q and q not in s["name"].lower() and q not in s["roll_number"].lower()):
            continue
        out.append({
            "id": r["attendance_id"],
            "session_id": r["session_id"],
            "course_id": r["course_id"],
            "course_code": r["course_code"],
            "date": r["date"],
            "start_time": r["start_time"],
            "time": r["time"],
            "status": r["status"],
            "method": r["method"],
            "student_id": r["student_id"],
            "name": s["name"],
            "roll_number": s["roll_number"],
            "department": s["department"],
        })
    return out


@bp.get("")
@requires(*STAFF)
def list_attendance():
    rows = _rows()
    return jsonify({"rows": rows[:LIMIT], "total": len(rows), "truncated": len(rows) > LIMIT})


@bp.get("/export")
@requires(*STAFF)
def export_attendance():
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Date", "Course", "Class start", "Roll Number", "Name", "Department", "Status", "Marked at", "Method"])
    for r in _rows():
        w.writerow([r["date"], r["course_code"], r["start_time"][:5], r["roll_number"], r["name"], r["department"],
                    r["status"], (r["time"] or "")[:5], r["method"] or ""])
    return Response(out.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=attendance-{clock.today()}.csv"})
