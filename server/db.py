"""SQLite storage: schema, migrations, connections and a few shared writes."""
import csv
import json
import os
import sqlite3
from datetime import datetime, timedelta

from flask import current_app, g
from werkzeug.security import generate_password_hash

from . import clock, codes
from .config import ATTENDANCE_CSV, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME, LATE_AFTER_MINUTES

SCHEMA_VERSION = 2

SCHEMA = """
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    name TEXT NOT NULL DEFAULT '',
    email TEXT,
    student_id INTEGER UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    -- Bumped on password change; tokens carry it, so old sessions stop working.
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_students (
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, student_id)
);

-- One lecture / lab of a course. Attendance is taken per session.
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    topic TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    late_after INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
    secret TEXT NOT NULL,
    opened_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    closed_at TEXT
);
CREATE INDEX IF NOT EXISTS sessions_course_date ON sessions (course_id, date);

-- A row means the student was there (or excused). No row in a closed session = absent.
CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('present', 'late', 'excused')),
    method TEXT NOT NULL CHECK (method IN ('camera', 'upload', 'manual', 'self', 'request')),
    time TEXT NOT NULL,
    confidence REAL,
    marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS attendance_student ON attendance (student_id);

-- Leave (excused absence) and correction ("I was there") requests from students.
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('leave', 'correction')),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    note TEXT,
    created_at TEXT NOT NULL,
    decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at TEXT
);

-- Faces the scanner saw but couldn't match, waiting for an admin to label them.
CREATE TABLE IF NOT EXISTS unknown_faces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    file TEXT NOT NULL,
    encoding BLOB NOT NULL,
    captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT,
    action TEXT NOT NULL,
    detail TEXT NOT NULL
);
"""


# ---------------------------------------------------------------- connections

def connect(path):
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    if "db" not in g:
        g.db = connect(current_app.config["DB_PATH"])
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# ---------------------------------------------------------------- shared writes

def create_student(db, roll_number, name, department, email=None, must_change_password=True):
    """Insert a student plus their login (username and starting password = roll number)."""
    now = clock.stamp()
    cur = db.execute(
        "INSERT INTO students (roll_number, name, department, email, created_at) VALUES (?, ?, ?, ?, ?)",
        (roll_number, name, department, email, now),
    )
    db.execute(
        """INSERT INTO users (username, password_hash, role, name, email, student_id, must_change_password, created_at)
           VALUES (?, ?, 'student', ?, ?, ?, ?, ?)""",
        (roll_number, generate_password_hash(roll_number), name, email, cur.lastrowid, int(must_change_password), now),
    )
    return cur.lastrowid


def create_user(db, username, password, role, name, email=None, must_change_password=False):
    cur = db.execute(
        """INSERT INTO users (username, password_hash, role, name, email, must_change_password, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (username, generate_password_hash(password), role, name, email, int(must_change_password), clock.stamp()),
    )
    return cur.lastrowid


def create_session(db, course_id, date, start_time, end_time, topic="", status="open",
                   late_after=LATE_AFTER_MINUTES, opened_by=None, closed_at=None):
    cur = db.execute(
        """INSERT INTO sessions (course_id, topic, date, start_time, end_time, late_after, status, secret, opened_by, closed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (course_id, topic, date, start_time, end_time, late_after, status, codes.new_secret(), opened_by, closed_at),
    )
    return cur.lastrowid


def audit(db, user, action, **detail):
    """Record who changed what. `user` is a users row or None for the system."""
    db.execute(
        "INSERT INTO audit_log (at, user_id, username, action, detail) VALUES (?, ?, ?, ?, ?)",
        (clock.stamp(), user["id"] if user else None, user["username"] if user else "system", action,
         json.dumps(detail, default=str)),
    )


# ---------------------------------------------------------------- setup and migrations

def _read_metadata(path):
    meta = {}
    with open(path) as f:
        for line in f:
            if ":" in line:
                key, value = line.split(":", 1)
                meta[key.strip().lower()] = value.strip()
    return meta


def dataset_people(dataset_dir):
    """(roll, name, department) for every dataset/<roll>/metadata.txt."""
    people = []
    if os.path.isdir(dataset_dir):
        for entry in sorted(os.listdir(dataset_dir)):
            meta_path = os.path.join(dataset_dir, entry, "metadata.txt")
            if os.path.exists(meta_path):
                meta = _read_metadata(meta_path)
                people.append((meta.get("roll number", entry), meta.get("name", entry), meta.get("department", "—")))
    return people


def _general_course(db, student_ids):
    """A catch-all course for attendance that predates courses."""
    cur = db.execute(
        "INSERT INTO courses (code, name, department, created_at) VALUES ('GEN101', 'General Attendance', 'All', ?)",
        (clock.stamp(),),
    )
    db.executemany("INSERT INTO course_students VALUES (?, ?)", [(cur.lastrowid, s) for s in student_ids])
    return cur.lastrowid


def _import_day_records(db, course_id, records):
    """records: [(student_id, datetime, method)] -> one closed session per day, everyone present."""
    by_day = {}
    for student_id, when, method in records:
        by_day.setdefault(when.date(), []).append((student_id, when, method))
    for day, rows in sorted(by_day.items()):
        first = min(r[1] for r in rows).replace(minute=0, second=0)
        session_id = create_session(
            db, course_id, day.isoformat(), first.strftime("%H:%M:%S"),
            (first + timedelta(hours=1)).strftime("%H:%M:%S"), topic="Imported", status="closed",
            late_after=60, closed_at=(first + timedelta(hours=1)).isoformat(sep=" "),
        )
        for student_id, when, method in rows:
            db.execute(
                "INSERT OR IGNORE INTO attendance (session_id, student_id, status, method, time) VALUES (?, ?, 'present', ?, ?)",
                (session_id, student_id, method, when.strftime("%H:%M:%S")),
            )


def _migrate_v1(db):
    """v1 stored one attendance row per student per day with no courses. Move it into v2."""
    students = [dict(r) for r in db.execute("SELECT * FROM students")]
    users = [dict(r) for r in db.execute("SELECT * FROM users")]
    old = [dict(r) for r in db.execute("SELECT * FROM attendance")]
    db.executescript("DROP TABLE attendance; DROP TABLE users; DROP TABLE students;")
    db.executescript(SCHEMA)
    for s in students:
        db.execute(
            "INSERT INTO students (id, roll_number, name, department, created_at) VALUES (?, ?, ?, ?, ?)",
            (s["id"], s["roll_number"], s["name"], s["department"], s["created_at"]),
        )
    names = {s["id"]: s["name"] for s in students}
    for u in users:
        db.execute(
            """INSERT INTO users (id, username, password_hash, role, name, student_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (u["id"], u["username"], u["password_hash"], u["role"],
             names.get(u["student_id"]) or ("Administrator" if u["role"] == "admin" else u["username"]),
             u["student_id"], clock.stamp()),
        )
    course_id = _general_course(db, [s["id"] for s in students])
    _import_day_records(db, course_id, [
        (a["student_id"], datetime.strptime(f"{a['date']} {a['time']}", "%Y-%m-%d %H:%M:%S"), a["method"]) for a in old
    ])


def demo_seeded(db):
    return db.execute("SELECT 1 FROM audit_log WHERE action = 'seed.demo'").fetchone() is not None


def init_db(path, dataset_dir, seed_demo=False):
    """Create or upgrade the schema. A brand-new database gets an admin and starting data."""
    fresh = not os.path.exists(path)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    db = connect(path)
    db.execute("PRAGMA foreign_keys = OFF")
    try:
        version = db.execute("PRAGMA user_version").fetchone()[0]
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        if version < 2 and "attendance" in tables and "session_id" not in {
            r["name"] for r in db.execute("PRAGMA table_info(attendance)")
        }:
            _migrate_v1(db)
        db.executescript(SCHEMA)
        db.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

        if fresh:
            create_user(db, DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD, "admin", "Administrator")
            if seed_demo:
                from .seed import seed_demo as seed
                seed(db, dataset_dir)
            else:
                _import_bundled(db, dataset_dir)
        elif seed_demo and not demo_seeded(db) and not db.execute("SELECT 1 FROM users WHERE role = 'teacher'").fetchone():
            # An older database (e.g. migrated from v1) that never got the demo: add it, reusing its students.
            from .seed import seed_demo as seed
            seed(db, dataset_dir)
        db.commit()
    finally:
        db.close()


def _import_bundled(db, dataset_dir):
    """Students from dataset/*/metadata.txt and history from the legacy attendance.csv."""
    ids = {}
    for roll, name, department in dataset_people(dataset_dir):
        ids[roll] = create_student(db, roll, name, department)
    if not ids:
        return
    course_id = _general_course(db, list(ids.values()))
    records = []
    if os.path.exists(ATTENDANCE_CSV):
        with open(ATTENDANCE_CSV, newline="") as f:
            for row in csv.DictReader(f):
                student_id = ids.get(row["Roll Number"].strip())
                if student_id:
                    records.append((student_id, datetime.strptime(row["Timestamp"].strip(), "%Y-%m-%d %H:%M:%S"), "camera"))
    _import_day_records(db, course_id, records)
