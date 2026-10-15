"""Marking students present in a session, from faces or by hand."""
import os
import uuid

import numpy as np
from flask import current_app
from PIL import Image

from . import clock
from .core import recognizer, student_payload
from .recognizer import crop
from .stats import minutes_after_start

# Faces smaller than this (pixels wide in the original image) are too blurry to be worth saving.
MIN_UNKNOWN_FACE_PX = 60
MAX_UNKNOWN_PER_SESSION = 40
# Two unknown faces closer than this are treated as the same stranger.
SAME_STRANGER_DISTANCE = 0.5


def status_for(session, time_str):
    late = minutes_after_start(session["start_time"], time_str) > session["late_after"]
    return "late" if late else "present"


def mark(db, session, student_id, method, *, time_str=None, status=None, marked_by=None, confidence=None):
    """Record attendance once per session. Returns the status stored, or None if already marked."""
    time_str = time_str or clock.now().strftime("%H:%M:%S")
    status = status or status_for(session, time_str)
    cur = db.execute(
        """INSERT OR IGNORE INTO attendance (session_id, student_id, status, method, time, confidence, marked_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (session["id"], student_id, status, method, time_str, confidence, marked_by),
    )
    return status if cur.rowcount == 1 else None


def similarity(distance):
    """A friendlier 0-100 score for a face distance (0 = identical)."""
    return None if distance is None else max(0, round((1 - distance) * 100))


def roster_ids(db, course_id):
    return {r[0] for r in db.execute("SELECT student_id FROM course_students WHERE course_id = ?", (course_id,))}


def scan(db, session, image, method, user):
    """Identify every face in `image` and mark matching students in `session`."""
    roster = roster_ids(db, session["course_id"])
    results = []
    for face in recognizer().identify(image):
        result = {"box": face["box"], "status": "unknown", "student": None,
                  "similarity": similarity(face["distance"]), "late": False}
        student = None
        if face["roll"]:
            student = db.execute("SELECT * FROM students WHERE roll_number = ?", (face["roll"],)).fetchone()
        if student is None:
            save_unknown(db, session, image, face)
        elif student["id"] not in roster:
            result["student"] = student_payload(student)
            result["status"] = "not_in_class"
        else:
            result["student"] = student_payload(student)
            stored = mark(db, session, student["id"], method, marked_by=user["id"],
                          confidence=1 - face["distance"])
            if stored:
                result["status"], result["late"] = "marked", stored == "late"
            else:
                existing = db.execute(
                    "SELECT status FROM attendance WHERE session_id = ? AND student_id = ?", (session["id"], student["id"])
                ).fetchone()
                result["status"], result["late"] = "already", existing["status"] == "late"
        results.append(result)
    db.commit()
    return results


def save_unknown(db, session, image, face):
    """Keep a crop of a face nobody recognised, once per stranger per session."""
    box = face["box"]
    if (box["right"] - box["left"]) * image.shape[1] < MIN_UNKNOWN_FACE_PX:
        return
    seen = db.execute("SELECT encoding FROM unknown_faces WHERE session_id = ?", (session["id"],)).fetchall()
    if len(seen) >= MAX_UNKNOWN_PER_SESSION:
        return
    if seen:
        known = np.array([np.frombuffer(r["encoding"], dtype=np.float64) for r in seen])
        if np.linalg.norm(known - face["encoding"], axis=1).min() < SAME_STRANGER_DISTANCE:
            return
    folder = current_app.config["UNKNOWN_DIR"]
    os.makedirs(folder, exist_ok=True)
    name = f"{uuid.uuid4().hex}.jpg"
    Image.fromarray(crop(image, box)).save(os.path.join(folder, name), quality=90)
    db.execute(
        "INSERT INTO unknown_faces (session_id, file, encoding, captured_at) VALUES (?, ?, ?, ?)",
        (session["id"], name, np.asarray(face["encoding"], dtype=np.float64).tobytes(), clock.stamp()),
    )
