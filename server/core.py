"""Helpers shared by the route modules: who can see what, and JSON shapes."""
from flask import current_app, request

from .errors import ApiError


def recognizer():
    return current_app.extensions["recognizer"]


def body():
    return request.get_json(silent=True) or {}


def qmarks(items):
    return ", ".join("?" * len(items))


# ---------------------------------------------------------------- scope

def course_ids(db, user):
    """Courses this user may see: all for admins, taught ones for teachers, enrolled ones for students."""
    if user["role"] == "admin":
        sql, args = "SELECT id FROM courses", ()
    elif user["role"] == "teacher":
        sql, args = "SELECT id FROM courses WHERE teacher_id = ?", (user["id"],)
    else:
        sql, args = "SELECT course_id FROM course_students WHERE student_id = ?", (user["student_id"],)
    return [r[0] for r in db.execute(sql, args)]


def get_course(db, user, course_id):
    course = db.execute("SELECT * FROM courses WHERE id = ?", (course_id,)).fetchone()
    if course is None:
        raise ApiError("Course not found.", 404)
    if course["id"] not in course_ids(db, user):
        raise ApiError("That isn't one of your courses.", 403)
    return course


def get_session(db, user, session_id):
    session = db.execute(
        """SELECT s.*, c.code AS course_code, c.name AS course_name, c.teacher_id
           FROM sessions s JOIN courses c ON c.id = s.course_id WHERE s.id = ?""",
        (session_id,),
    ).fetchone()
    if session is None:
        raise ApiError("Class session not found.", 404)
    if session["course_id"] not in course_ids(db, user):
        raise ApiError("That isn't one of your classes.", 403)
    return session


def get_student(db, student_id):
    student = db.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
    if student is None:
        raise ApiError("Student not found.", 404)
    return student


def can_view_student(db, user, student_id):
    """Admins see everyone, teachers see students in their courses, students see themselves."""
    if user["role"] == "admin":
        return True
    if user["role"] == "student":
        return user["student_id"] == student_id
    ids = course_ids(db, user)
    return bool(ids) and db.execute(
        f"SELECT 1 FROM course_students WHERE student_id = ? AND course_id IN ({qmarks(ids)})", (student_id, *ids)
    ).fetchone() is not None


# ---------------------------------------------------------------- payloads

def student_payload(row):
    rec = recognizer()
    return {
        "id": row["id"],
        "roll_number": row["roll_number"],
        "name": row["name"],
        "department": row["department"],
        "email": row["email"] if "email" in row.keys() else None,
        "enrolled": row["roll_number"] in rec.known_rolls,
        "has_photo": rec.photo_path(row["roll_number"]) is not None,
    }


def course_payload(row):
    return {
        "id": row["id"],
        "code": row["code"],
        "name": row["name"],
        "department": row["department"],
        "teacher_id": row["teacher_id"],
        "teacher_name": row["teacher_name"] if "teacher_name" in row.keys() else None,
    }


def session_payload(row):
    keys = row.keys()
    return {
        "id": row["id"],
        "course_id": row["course_id"],
        "course_code": row["course_code"] if "course_code" in keys else None,
        "course_name": row["course_name"] if "course_name" in keys else None,
        "topic": row["topic"],
        "date": row["date"],
        "start_time": row["start_time"],
        "end_time": row["end_time"],
        "late_after": row["late_after"],
        "status": row["status"],
        "closed_at": row["closed_at"],
    }


def user_payload(db, user):
    payload = {
        "id": user["id"],
        "username": user["username"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "must_change_password": bool(user["must_change_password"]),
        "student": None,
    }
    if user["student_id"]:
        payload["student"] = student_payload(
            db.execute("SELECT * FROM students WHERE id = ?", (user["student_id"],)).fetchone()
        )
    return payload
