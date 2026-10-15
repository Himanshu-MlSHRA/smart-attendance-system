"""Signed bearer tokens, role checks and login throttling."""
import threading
import time
from collections import defaultdict, deque
from functools import wraps

from flask import g, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from . import db as store
from .config import LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS, SECRET_KEY, TOKEN_MAX_AGE
from .errors import ApiError

STAFF = ("admin", "teacher")

signer = URLSafeTimedSerializer(SECRET_KEY, salt="auth")


def issue_token(user):
    # The token carries token_version, so bumping it (password change) logs out old sessions.
    return signer.dumps([user["id"], user["token_version"]])


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise ApiError("Not signed in.", 401)
    try:
        user_id, version = signer.loads(header[7:], max_age=TOKEN_MAX_AGE)
    except SignatureExpired:
        raise ApiError("Session expired. Sign in again.", 401)
    except (BadSignature, TypeError, ValueError):
        raise ApiError("Invalid session.", 401)
    user = store.get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        raise ApiError("Account no longer exists.", 401)
    if user["token_version"] != version:
        raise ApiError("Signed out because the password changed. Sign in again.", 401)
    return user


def requires(*roles):
    """Require a signed-in user, optionally with one of `roles`. Sets g.user."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            g.user = current_user()
            if roles and g.user["role"] not in roles:
                raise ApiError("You don't have access to this.", 403)
            return fn(*args, **kwargs)
        return wrapper
    return decorator


class Throttle:
    """Counts recent failures per key and refuses once there are too many."""

    def __init__(self, limit, window):
        self.limit, self.window = limit, window
        self.hits = defaultdict(deque)
        self.lock = threading.Lock()

    def _trim(self, key, now):
        q = self.hits[key]
        while q and q[0] < now - self.window:
            q.popleft()
        return q

    def check(self, key):
        """Raise 429 if `key` is locked out."""
        now = time.monotonic()
        with self.lock:
            q = self._trim(key, now)
            if len(q) >= self.limit:
                wait = int(q[0] + self.window - now) + 1
                raise ApiError(f"Too many attempts. Try again in {wait // 60 + 1} min.", 429)

    def fail(self, key):
        with self.lock:
            self.hits[key].append(time.monotonic())

    def reset(self, key):
        with self.lock:
            self.hits.pop(key, None)


login_throttle = Throttle(LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS)
