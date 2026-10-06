"""SQLite storage for students, users and attendance."""
import csv
import os
import sqlite3
from datetime import datetime

from flask import g
from werkzeug.security import generate_password_hash

from .config import ATTENDANCE_CSV, DATASET_DIR, DB_PATH, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME

SCHEMA = """
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('camera', 'upload', 'manual', 'self')),
    UNIQUE (student_id, date)
);
"""


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    if "db" not in g:
        g.db = connect()
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def create_student(db, roll_number, name, department):
    """Insert a student plus their login (username and default password = roll number)."""
    cur = db.execute(
        "INSERT INTO students (roll_number, name, department, created_at) VALUES (?, ?, ?, ?)",
        (roll_number, name, department, datetime.now().isoformat(timespec="seconds")),
    )
    db.execute(
        "INSERT INTO users (username, password_hash, role, student_id) VALUES (?, ?, 'student', ?)",
        (roll_number, generate_password_hash(roll_number), cur.lastrowid),
    )
    return cur.lastrowid


def mark(db, student_id, method, when=None):
    """Mark a student present for the day. Returns False if already marked."""
    when = when or datetime.now()
    cur = db.execute(
        "INSERT OR IGNORE INTO attendance (student_id, date, time, method) VALUES (?, ?, ?, ?)",
        (student_id, when.strftime("%Y-%m-%d"), when.strftime("%H:%M:%S"), method),
    )
    return cur.rowcount == 1


def _read_metadata(path):
    meta = {}
    with open(path) as f:
        for line in f:
            if ":" in line:
                key, value = line.split(":", 1)
                meta[key.strip().lower()] = value.strip()
    return meta


def init_db():
    """Create tables and, on first run, import the legacy dataset metadata and attendance.csv."""
    fresh = not os.path.exists(DB_PATH)
    db = connect()
    db.executescript(SCHEMA)

    if fresh:
        db.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')",
            (DEFAULT_ADMIN_USERNAME, generate_password_hash(DEFAULT_ADMIN_PASSWORD)),
        )
        if os.path.isdir(DATASET_DIR):
            for entry in sorted(os.listdir(DATASET_DIR)):
                meta_path = os.path.join(DATASET_DIR, entry, "metadata.txt")
                if os.path.exists(meta_path):
                    meta = _read_metadata(meta_path)
                    create_student(db, meta.get("roll number", entry), meta.get("name", entry), meta.get("department", "—"))
        if os.path.exists(ATTENDANCE_CSV):
            with open(ATTENDANCE_CSV, newline="") as f:
                for row in csv.DictReader(f):
                    student = db.execute(
                        "SELECT id FROM students WHERE roll_number = ?", (row["Roll Number"].strip(),)
                    ).fetchone()
                    if student is None:
                        continue
                    when = datetime.strptime(row["Timestamp"].strip(), "%Y-%m-%d %H:%M:%S")
                    mark(db, student["id"], "camera", when)
        db.commit()
    db.close()
