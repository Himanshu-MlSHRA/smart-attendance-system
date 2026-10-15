"""Attendance arithmetic and the aggregates behind the dashboards.

Rules:
- A session counts once it's closed, or earlier if the student already has a record in it.
- present and late both count as attended; excused sessions are left out of the total.
- percent = attended / (attended + absent).
"""
from collections import defaultdict
from datetime import date, datetime, timedelta

from . import clock
from .config import DEFAULTER_THRESHOLD
from .core import qmarks

ARRIVAL_BUCKETS = list(range(-15, 35, 5))  # minutes relative to class start


def summarize(present=0, late=0, excused=0, absent=0):
    attended = present + late
    held = attended + absent
    percent = round(attended * 100 / held) if held else None
    return {
        "present": present,
        "late": late,
        "excused": excused,
        "absent": absent,
        "attended": attended,
        "held": held,
        "percent": percent,
        "defaulter": percent is not None and percent < DEFAULTER_THRESHOLD,
    }


def counts(db, course_ids, student_ids=None):
    """{(student_id, course_id): {present, late, excused, absent}} over counted sessions."""
    if not course_ids:
        return {}
    sql = f"""
        SELECT cs.student_id, s.course_id,
               SUM(a.status = 'present') AS present, SUM(a.status = 'late') AS late,
               SUM(a.status = 'excused') AS excused, SUM(a.id IS NULL) AS absent
        FROM course_students cs
        JOIN sessions s ON s.course_id = cs.course_id
        LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = cs.student_id
        WHERE s.course_id IN ({qmarks(course_ids)}) AND (s.status = 'closed' OR a.id IS NOT NULL)"""
    args = list(course_ids)
    if student_ids is not None:
        if not student_ids:
            return {}
        sql += f" AND cs.student_id IN ({qmarks(student_ids)})"
        args += list(student_ids)
    sql += " GROUP BY cs.student_id, s.course_id"
    return {
        (r["student_id"], r["course_id"]): {k: r[k] or 0 for k in ("present", "late", "excused", "absent")}
        for r in db.execute(sql, args)
    }


def per_student(db, course_ids, student_ids=None):
    """{student_id: summary} summed over the given courses."""
    totals = defaultdict(lambda: defaultdict(int))
    for (student_id, _course), c in counts(db, course_ids, student_ids).items():
        for k, v in c.items():
            totals[student_id][k] += v
    return {sid: summarize(**t) for sid, t in totals.items()}


def history(db, course_ids, student_ids=None, since=None):
    """Every counted (student, session) pair with its outcome, oldest first."""
    if not course_ids:
        return []
    sql = f"""
        SELECT cs.student_id, s.id AS session_id, s.course_id, s.date, s.start_time, s.topic,
               c.code AS course_code, c.name AS course_name,
               COALESCE(a.status, 'absent') AS status, a.time, a.method, a.id AS attendance_id
        FROM course_students cs
        JOIN sessions s ON s.course_id = cs.course_id
        JOIN courses c ON c.id = s.course_id
        LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = cs.student_id
        WHERE s.course_id IN ({qmarks(course_ids)}) AND (s.status = 'closed' OR a.id IS NOT NULL)"""
    args = list(course_ids)
    if student_ids is not None:
        sql += f" AND cs.student_id IN ({qmarks(student_ids)})"
        args += list(student_ids)
    if since:
        sql += " AND s.date >= ?"
        args.append(since)
    sql += " ORDER BY s.date, s.start_time"
    return [dict(r) for r in db.execute(sql, args)]


def _week_start(iso):
    d = date.fromisoformat(iso)
    return d - timedelta(days=d.weekday())


def weekly_rates(rows, weeks=8):
    """Attendance % per week for the last `weeks` weeks (None where nothing was held)."""
    this_week = clock.today() - timedelta(days=clock.today().weekday())
    starts = [this_week - timedelta(weeks=weeks - 1 - i) for i in range(weeks)]
    tally = {s: [0, 0] for s in starts}
    for r in rows:
        if r["status"] == "excused":
            continue
        w = _week_start(r["date"])
        if w in tally:
            tally[w][1] += 1
            tally[w][0] += r["status"] in ("present", "late")
    return [
        {"week": s.isoformat(), "rate": round(a * 100 / h) if h else None}
        for s, (a, h) in tally.items()
    ]


def minutes_after_start(start_time, marked_time):
    start = datetime.strptime(start_time, "%H:%M:%S")
    marked = datetime.strptime(marked_time, "%H:%M:%S")
    return (marked - start).total_seconds() / 60


def streaks(rows):
    """(current, best) runs of attended sessions; excused ones don't break a run."""
    best = run = 0
    for r in rows:
        if r["status"] == "excused":
            continue
        if r["status"] in ("present", "late"):
            run += 1
            best = max(best, run)
        else:
            run = 0
    return run, best


# ---------------------------------------------------------------- staff dashboard

def dashboard(db, course_ids, is_admin):
    today = clock.today().isoformat()
    ids = list(course_ids)
    q = qmarks(ids) if ids else "NULL"

    roster_sizes = dict(db.execute(
        f"SELECT course_id, COUNT(*) FROM course_students WHERE course_id IN ({q}) GROUP BY course_id", ids
    ).fetchall())
    if is_admin:
        total_students = db.execute("SELECT COUNT(*) FROM students").fetchone()[0]
    else:
        total_students = db.execute(
            f"SELECT COUNT(DISTINCT student_id) FROM course_students WHERE course_id IN ({q})", ids
        ).fetchone()[0]

    # Today's classes
    todays = []
    for s in db.execute(
        f"""SELECT s.*, c.code AS course_code, c.name AS course_name,
                   (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status != 'excused') AS here
            FROM sessions s JOIN courses c ON c.id = s.course_id
            WHERE s.date = ? AND s.course_id IN ({q}) ORDER BY s.start_time""",
        [today, *ids],
    ):
        todays.append({**session_payload_lite(s), "present": s["here"], "roster": roster_sizes.get(s["course_id"], 0)})
    present_today = db.execute(
        f"""SELECT COUNT(DISTINCT a.student_id) FROM attendance a JOIN sessions s ON s.id = a.session_id
            WHERE s.date = ? AND s.course_id IN ({q}) AND a.status != 'excused'""",
        [today, *ids],
    ).fetchone()[0]

    # Per-student standing
    summaries = per_student(db, ids)
    rated = [s["percent"] for s in summaries.values() if s["percent"] is not None]
    since = (clock.today() - timedelta(weeks=8)).isoformat()
    rows = history(db, ids, since=since)
    by_student = defaultdict(list)
    for r in rows:
        by_student[r["student_id"]].append(r)

    at_risk = []
    names = {r["id"]: r for r in db.execute("SELECT id, name, roll_number, department FROM students")}
    for sid, s in summaries.items():
        if s["percent"] is not None and s["percent"] < DEFAULTER_THRESHOLD + 5 and sid in names:
            n = names[sid]
            at_risk.append({
                "id": sid, "name": n["name"], "roll_number": n["roll_number"], "department": n["department"],
                **s, "weekly": [w["rate"] for w in weekly_rates(by_student[sid])],
            })
    at_risk.sort(key=lambda r: r["percent"])

    # Heatmap: class-wide turnout per day for the last 18 weeks
    heat_since = clock.today() - timedelta(weeks=17, days=clock.today().weekday())  # a Monday
    first = db.execute(f"SELECT MIN(date) FROM sessions WHERE course_id IN ({q})", ids).fetchone()[0]
    if first and first > heat_since.isoformat():
        heat_since = _week_start(first)  # don't pad with empty months before the first class
    heat_since = min(heat_since, clock.today() - timedelta(weeks=7, days=clock.today().weekday()))
    day_tally = defaultdict(lambda: [0, 0, 0])  # attended, expected, sessions
    for s in db.execute(
        f"""SELECT s.id, s.date, s.course_id,
                   (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status IN ('present', 'late')) AS here,
                   (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status = 'excused') AS excused
            FROM sessions s WHERE s.status = 'closed' AND s.date >= ? AND s.course_id IN ({q})""",
        [heat_since.isoformat(), *ids],
    ):
        t = day_tally[s["date"]]
        t[0] += s["here"]
        t[1] += max(roster_sizes.get(s["course_id"], 0) - s["excused"], 0)
        t[2] += 1
    heatmap = []
    d = heat_since
    while d <= clock.today():
        a, e, n = day_tally.get(d.isoformat(), (0, 0, 0))
        heatmap.append({"date": d.isoformat(), "sessions": n, "rate": round(a * 100 / e) if e else None})
        d += timedelta(days=1)

    # Arrival times relative to class start
    arrivals = {b: 0 for b in ARRIVAL_BUCKETS}
    for r in db.execute(
        f"""SELECT a.time, s.start_time FROM attendance a JOIN sessions s ON s.id = a.session_id
            WHERE a.status IN ('present', 'late') AND a.method IN ('camera', 'self', 'upload')
              AND s.date >= ? AND s.course_id IN ({q})""",
        [since, *ids],
    ):
        m = minutes_after_start(r["start_time"], r["time"])
        bucket = max(ARRIVAL_BUCKETS[0], min(ARRIVAL_BUCKETS[-1], int(m // 5) * 5))
        arrivals[bucket] += 1

    # Courses at a glance
    course_list = []
    for c in db.execute(
        f"""SELECT c.*, u.name AS teacher_name FROM courses c LEFT JOIN users u ON u.id = c.teacher_id
            WHERE c.id IN ({q}) ORDER BY c.code""",
        ids,
    ):
        held = att = exp = 0
        for s in db.execute(
            """SELECT (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status IN ('present','late')) AS here,
                      (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status = 'excused') AS excused
               FROM sessions s WHERE s.course_id = ? AND s.status = 'closed'""",
            (c["id"],),
        ):
            held += 1
            att += s["here"]
            exp += max(roster_sizes.get(c["id"], 0) - s["excused"], 0)
        course_list.append({
            "id": c["id"], "code": c["code"], "name": c["name"], "teacher_name": c["teacher_name"],
            "students": roster_sizes.get(c["id"], 0), "sessions": held, "rate": round(att * 100 / exp) if exp else None,
        })

    recent = db.execute(
        f"""SELECT a.id, a.status, a.method, a.time, s.date, c.code AS course_code,
                   st.id AS student_id, st.name, st.roll_number, st.department
            FROM attendance a JOIN sessions s ON s.id = a.session_id JOIN courses c ON c.id = s.course_id
            JOIN students st ON st.id = a.student_id
            WHERE s.course_id IN ({q}) AND a.status != 'excused'
            ORDER BY s.date DESC, a.time DESC LIMIT 8""",
        ids,
    ).fetchall()

    pending = db.execute(
        f"""SELECT COUNT(*) FROM requests r JOIN sessions s ON s.id = r.session_id
            WHERE r.status = 'pending' AND s.course_id IN ({q})""",
        ids,
    ).fetchone()[0]

    overall_week = weekly_rates(rows)
    return {
        "total_students": total_students,
        "courses": len(ids),
        "present_today": present_today,
        "sessions_held": db.execute(
            f"SELECT COUNT(*) FROM sessions WHERE status = 'closed' AND course_id IN ({q})", ids
        ).fetchone()[0],
        "average_rate": round(sum(rated) / len(rated)) if rated else None,
        "defaulters": sum(1 for s in summaries.values() if s["defaulter"]),
        "threshold": DEFAULTER_THRESHOLD,
        "pending_requests": pending,
        "unknown_faces": db.execute("SELECT COUNT(*) FROM unknown_faces").fetchone()[0] if is_admin else 0,
        "today": todays,
        "heatmap": heatmap,
        "arrivals": [{"minute": b, "count": n} for b, n in arrivals.items()],
        "weekly": overall_week,
        "at_risk": at_risk[:8],
        "course_breakdown": course_list,
        "recent": [dict(r) for r in recent],
    }


def session_payload_lite(s):
    return {
        "id": s["id"], "course_id": s["course_id"], "course_code": s["course_code"], "course_name": s["course_name"],
        "topic": s["topic"], "date": s["date"], "start_time": s["start_time"], "end_time": s["end_time"],
        "status": s["status"],
    }


# ---------------------------------------------------------------- one student

BADGES = [
    ("streak10", "On fire", "10 classes in a row"),
    ("perfect_week", "Perfect week", "Every class in a week with 3+ classes"),
    ("early_bird", "Early bird", "Arrived before start 10 times"),
    ("never_late", "Clockwork", "15+ classes attended, never late"),
    ("comeback", "Comeback", "Back above the line after dropping below it"),
]


def badges(rows):
    attended = [r for r in rows if r["status"] in ("present", "late")]
    _, best = streaks(rows)
    weeks = defaultdict(lambda: [0, 0])
    for r in rows:
        if r["status"] == "excused":
            continue
        w = weeks[_week_start(r["date"])]
        w[1] += 1
        w[0] += r["status"] in ("present", "late")
    early = sum(1 for r in attended if r["time"] and minutes_after_start(r["start_time"], r["time"]) < 0)

    # Running percentage dipped below the line and later recovered.
    comeback, dipped, a, h = False, False, 0, 0
    for r in rows:
        if r["status"] == "excused":
            continue
        h += 1
        a += r["status"] in ("present", "late")
        pct = a * 100 / h
        if h >= 5 and pct < DEFAULTER_THRESHOLD:
            dipped = True
        elif dipped and pct >= DEFAULTER_THRESHOLD:
            comeback = True

    earned = {
        "streak10": best >= 10,
        "perfect_week": any(h >= 3 and a == h for a, h in weeks.values()),
        "early_bird": early >= 10,
        "never_late": len(attended) >= 15 and not any(r["status"] == "late" for r in rows),
        "comeback": comeback,
    }
    return [{"id": i, "label": label, "description": desc, "earned": earned[i]} for i, label, desc in BADGES]


def student_report(db, student_id, course_ids):
    """Everything about one student's attendance across `course_ids`."""
    rows = history(db, course_ids, [student_id])
    c = counts(db, course_ids, [student_id])
    courses = []
    for course in db.execute(
        f"""SELECT c.*, u.name AS teacher_name FROM courses c LEFT JOIN users u ON u.id = c.teacher_id
            JOIN course_students cs ON cs.course_id = c.id AND cs.student_id = ?
            WHERE c.id IN ({qmarks(course_ids) if course_ids else 'NULL'}) ORDER BY c.code""",
        [student_id, *course_ids],
    ):
        courses.append({
            "id": course["id"], "code": course["code"], "name": course["name"], "teacher_name": course["teacher_name"],
            **summarize(**c.get((student_id, course["id"]), {})),
        })
    total = defaultdict(int)
    for v in c.values():
        for k, n in v.items():
            total[k] += n
    current, best = streaks(rows)

    pending = {
        r["session_id"]: {"id": r["id"], "kind": r["kind"], "status": r["status"]}
        for r in db.execute(
            "SELECT id, session_id, kind, status FROM requests WHERE student_id = ? ORDER BY id", (student_id,)
        )
    }
    timeline = [
        {
            "session_id": r["session_id"], "course_id": r["course_id"], "course_code": r["course_code"],
            "course_name": r["course_name"], "date": r["date"], "start_time": r["start_time"], "topic": r["topic"],
            "status": r["status"], "time": r["time"], "method": r["method"], "request": pending.get(r["session_id"]),
        }
        for r in reversed(rows)
    ]
    return {
        "overall": summarize(**total),
        "threshold": DEFAULTER_THRESHOLD,
        "courses": courses,
        "timeline": timeline,
        "streak": current,
        "best_streak": best,
        "weekly": weekly_rates(rows, weeks=10),
        "badges": badges(rows),
    }
