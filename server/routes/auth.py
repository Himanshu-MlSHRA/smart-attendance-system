from flask import Blueprint, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from .. import db as store
from ..auth import issue_token, login_throttle, requires
from ..core import body, user_payload
from ..errors import ApiError

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def client_ip():
    # Behind Render/Vercel the real address is the first X-Forwarded-For hop.
    forwarded = request.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() or request.remote_addr or "?"


@bp.post("/login")
def login():
    key = client_ip()
    login_throttle.check(key)
    data = body()
    username = str(data.get("username", "")).strip()
    db = store.get_db()
    user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], str(data.get("password", ""))):
        login_throttle.fail(key)
        raise ApiError("Wrong username or password.", 401)
    login_throttle.reset(key)
    return jsonify({"token": issue_token(user), "user": user_payload(db, user)})


@bp.get("/demo")
def demo_accounts():
    """Demo sign-ins for the login page, only those that exist and still have their demo password."""
    from ..config import DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME
    from ..seed import TEACHER_PASSWORD, TEACHERS

    db = store.get_db()
    if not store.demo_seeded(db):
        return jsonify([])
    candidates = [
        ("Admin", DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD),
        ("Teacher", TEACHERS[0][0], TEACHER_PASSWORD),
    ]
    student = db.execute(
        "SELECT roll_number FROM students s JOIN users u ON u.student_id = s.id ORDER BY s.roll_number = '231417' DESC, s.id LIMIT 1"
    ).fetchone()
    if student:
        candidates.append(("Student", student[0], student[0]))
    out = []
    for label, username, password in candidates:
        user = db.execute("SELECT password_hash FROM users WHERE username = ?", (username,)).fetchone()
        if user and check_password_hash(user["password_hash"], password):
            out.append({"label": label, "username": username, "password": password})
    return jsonify(out)


@bp.get("/me")
@requires()
def me():
    return jsonify(user_payload(store.get_db(), g.user))


@bp.post("/password")
@requires()
def change_password():
    data = body()
    if not check_password_hash(g.user["password_hash"], str(data.get("current", ""))):
        raise ApiError("Current password is wrong.")
    new = str(data.get("new", ""))
    if len(new) < 6:
        raise ApiError("New password must be at least 6 characters.")
    if new == g.user["username"]:
        raise ApiError("Pick something other than your username.")
    db = store.get_db()
    db.execute(
        """UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1
           WHERE id = ?""",
        (generate_password_hash(new), g.user["id"]),
    )
    store.audit(db, g.user, "password.change")
    db.commit()
    user = db.execute("SELECT * FROM users WHERE id = ?", (g.user["id"],)).fetchone()
    # Other devices are signed out; this one gets a fresh token.
    return jsonify({"token": issue_token(user), "user": user_payload(db, user)})
