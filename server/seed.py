"""Demo data: two teachers, four courses, a class of 30 and ~9 weeks of realistic attendance.

A brand-new database is seeded automatically unless SEED_DEMO=0. To start over:
    python -m server.seed --reset
"""
import argparse
import os
import random
from datetime import datetime, timedelta

from . import clock
from . import db as store
from .config import DATASET_DIR, DB_PATH, LATE_AFTER_MINUTES

TEACHERS = [
    ("t.sharma", "Prof. Anjali Sharma", "anjali.sharma@example.edu"),
    ("t.kulkarni", "Prof. Rohan Kulkarni", "rohan.kulkarni@example.edu"),
]
TEACHER_PASSWORD = "teacher123"

# code, name, teacher, [(weekday, start)], minutes, topics
COURSES = [
    ("ITC501", "Machine Learning", "t.sharma", [(0, "09:00"), (2, "09:00"), (4, "09:00")], 60,
     ["Linear regression", "Gradient descent", "Logistic regression", "Decision trees", "Random forests", "SVMs",
      "k-means", "PCA", "Neural nets 101", "Backprop", "CNNs", "Model evaluation"]),
    ("ITC502", "Web Engineering", "t.kulkarni", [(1, "10:15"), (3, "10:15")], 60,
     ["HTTP deep dive", "REST design", "React state", "Routing", "Auth & JWT", "Caching", "WebSockets", "Testing"]),
    ("ITC503", "Cloud Computing", "t.sharma", [(0, "11:30"), (3, "11:30")], 60,
     ["Virtualisation", "Containers", "Kubernetes", "Serverless", "Object storage", "IAM", "Autoscaling"]),
    ("ITL504", "Mini Project Lab", "t.kulkarni", [(2, "14:00")], 120,
     ["Proposal review", "Design review", "Sprint demo", "Code review", "Testing clinic", "Final demo prep"]),
]

NAMES = [
    "Aarav Kulkarni", "Ishita Deshpande", "Rohan Patil", "Sneha Joshi", "Aditya Shinde", "Pooja Gaikwad",
    "Siddharth Pawar", "Neha Bhosale", "Omkar Jadhav", "Riya Chavan", "Yash More", "Tanvi Kale",
    "Pranav Salunkhe", "Ananya Mane", "Kunal Thakur", "Shruti Naik", "Vedant Sawant", "Aisha Shaikh",
    "Harshad Gokhale", "Mitali Rane", "Tejas Ghorpade", "Sakshi Kadam", "Nikhil Wagh", "Divya Iyer",
    "Atharva Lokhande",
]

LEAVE_REASONS = ["Fever, doctor's note attached", "Family function out of town", "Sports meet (college team)",
                 "Hospital appointment", "University exam duty"]
CORRECTION_REASONS = ["I was there, the camera didn't catch me", "Sat at the back, scanner missed me",
                      "Checked in but the app timed out"]


def _student_profiles(rng, rolls, real_rolls):
    """Each student gets an attendance habit: steady, struggling or fading over the term."""
    profiles = {}
    plain = [r for r in rolls if r not in real_rolls]
    rng.shuffle(plain)
    struggling, fading = set(plain[:4]), set(plain[4:7])
    for roll in rolls:
        lateness = rng.choice([-2, -1, 0, 0, 2, 4, 9]) if roll not in real_rolls else rng.choice([-2, -1, 0])
        if roll in struggling:
            profiles[roll] = (rng.uniform(0.5, 0.7), rng.uniform(0.5, 0.7), lateness + 3)
        elif roll in fading:
            profiles[roll] = (0.97, rng.uniform(0.35, 0.55), lateness)
        else:
            p = rng.uniform(0.82, 0.98)
            profiles[roll] = (p, p, lateness)
    return profiles


def seed_demo(db, dataset_dir):
    rng = random.Random(42)
    now = clock.now()

    teacher_ids = {
        username: store.create_user(db, username, TEACHER_PASSWORD, "teacher", name, email)
        for username, name, email in TEACHERS
    }

    real = store.dataset_people(dataset_dir)
    existing = {r["roll_number"]: r["id"] for r in db.execute("SELECT id, roll_number FROM students")}
    taken = {r for r, _, _ in real} | set(existing)
    people = list(real)
    roll = 231420
    for name in NAMES:
        while str(roll) in taken:
            roll += 1
        people.append((str(roll), name, "IT"))
        roll += 1
    student_ids = {}
    for r, name, dept in people:
        if r in existing:  # already there (e.g. migrated from an older database): reuse
            student_ids[r] = existing[r]
            db.execute("UPDATE students SET email = COALESCE(email, ?) WHERE id = ?", (f"{r}@example.edu", existing[r]))
        else:
            student_ids[r] = store.create_student(db, r, name, dept, f"{r}@example.edu", must_change_password=False)
    real_rolls = {r for r, _, _ in real} | set(existing)

    course_ids = {}
    for code, name, teacher, _slots, _mins, _topics in COURSES:
        cur = db.execute(
            "INSERT INTO courses (code, name, department, teacher_id, created_at) VALUES (?, ?, 'IT', ?, ?)",
            (code, name, teacher_ids[teacher], clock.stamp()),
        )
        course_ids[code] = cur.lastrowid
        db.executemany("INSERT INTO course_students VALUES (?, ?)", [(cur.lastrowid, s) for s in student_ids.values()])

    profiles = _student_profiles(rng, list(student_ids), real_rolls)
    weeks = 9
    first = (now.date() - timedelta(weeks=weeks - 1, days=now.weekday()))
    holiday = first + timedelta(weeks=3, days=rng.randint(0, 4))
    absences = []  # (session_id, student_id, date) for requests later
    topic_index = {code: 0 for code in course_ids}
    day = first
    while day <= now.date():
        if day.weekday() >= 5 or day == holiday:
            day += timedelta(days=1)
            continue
        progress = (day - first).days / max(1, (now.date() - first).days)
        for code, _name, teacher, slots, minutes, topics in COURSES:
            for weekday, start in slots:
                if weekday != day.weekday():
                    continue
                start_dt = datetime.combine(day, datetime.strptime(start, "%H:%M").time())
                end_dt = start_dt + timedelta(minutes=minutes)
                if end_dt > now:
                    continue  # leave today's upcoming classes for a live demo
                topic = topics[topic_index[code] % len(topics)]
                topic_index[code] += 1
                session_id = store.create_session(
                    db, course_ids[code], day.isoformat(), start_dt.strftime("%H:%M:%S"), end_dt.strftime("%H:%M:%S"),
                    topic=topic, status="closed", late_after=LATE_AFTER_MINUTES, opened_by=teacher_ids[teacher],
                    closed_at=end_dt.isoformat(sep=" "),
                )
                for r, sid in student_ids.items():
                    p_start, p_end, lateness = profiles[r]
                    if rng.random() < p_start + (p_end - p_start) * progress:
                        offset = max(-12, min(35, rng.gauss(lateness - 1.5, 4.5)))
                        marked = start_dt + timedelta(minutes=offset, seconds=rng.randint(0, 59))
                        method = rng.choices(["camera", "self", "upload", "manual"], [70, 18, 8, 4])[0]
                        db.execute(
                            """INSERT INTO attendance (session_id, student_id, status, method, time, confidence, marked_by)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (session_id, sid, "late" if offset > LATE_AFTER_MINUTES else "present", method,
                             marked.strftime("%H:%M:%S"),
                             None if method == "manual" else round(rng.uniform(0.55, 0.72), 3),
                             None if method == "self" else teacher_ids[teacher]),
                        )
                    else:
                        absences.append((session_id, sid, day, teacher_ids[teacher], start_dt))
        day += timedelta(days=1)

    # Some absences were excused through approved leave; a few requests are still waiting.
    rng.shuffle(absences)
    recent = [a for a in absences if (now.date() - a[2]).days <= 10]
    pending = []
    seen_students = set()
    for a in recent:
        if a[1] not in seen_students and len(pending) < 5:
            pending.append(a)
            seen_students.add(a[1])
    for session_id, sid, day_, teacher_id, start_dt in absences:
        decided = (session_id, sid, day_, teacher_id, start_dt) not in pending
        roll_ = rng.random()
        if decided and roll_ < 0.05:
            _request(db, sid, session_id, "leave", rng.choice(LEAVE_REASONS), "approved", teacher_id, start_dt)
            db.execute(
                """INSERT INTO attendance (session_id, student_id, status, method, time, marked_by)
                   VALUES (?, ?, 'excused', 'request', ?, ?)""",
                (session_id, sid, start_dt.strftime("%H:%M:%S"), teacher_id),
            )
        elif decided and roll_ < 0.065:
            _request(db, sid, session_id, "correction", rng.choice(CORRECTION_REASONS), "rejected", teacher_id, start_dt,
                     note="Not seen on the scanner log or the group photo.")
    for i, (session_id, sid, _day, _t, start_dt) in enumerate(pending):
        kind = "leave" if i % 2 == 0 else "correction"
        reason = rng.choice(LEAVE_REASONS if kind == "leave" else CORRECTION_REASONS)
        _request(db, sid, session_id, kind, reason, "pending", None, start_dt)

    store.audit(db, None, "seed.demo", students=len(student_ids), courses=len(course_ids))


def _request(db, student_id, session_id, kind, reason, status, decided_by, start_dt, note=None):
    created = start_dt + timedelta(hours=5)
    db.execute(
        """INSERT INTO requests (student_id, session_id, kind, reason, status, note, created_at, decided_by, decided_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (student_id, session_id, kind, reason, status, note, created.isoformat(sep=" "), decided_by,
         (created + timedelta(days=1)).isoformat(sep=" ") if decided_by else None),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="delete the database first")
    args = parser.parse_args()
    if os.path.exists(DB_PATH):
        if not args.reset:
            raise SystemExit(f"{DB_PATH} already exists. Use --reset to wipe it and seed demo data.")
        os.remove(DB_PATH)
    store.init_db(DB_PATH, DATASET_DIR, seed_demo=True)
    print(f"Seeded demo data into {DB_PATH}.")
