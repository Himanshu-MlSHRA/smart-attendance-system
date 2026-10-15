"""Rotating check-in codes, TOTP-style.

Each class session has a random secret. The code shown on the classroom screen is
HMAC(secret, current 30-second step), so it can't be guessed or reused later, and
nothing has to be stored per code. A student typing it proves they can see the screen.
"""
import hashlib
import hmac
import secrets
import time

from .config import CODE_DIGITS, CODE_STEP_SECONDS


def new_secret():
    return secrets.token_hex(16)


def _code(secret, step):
    digest = hmac.new(secret.encode(), str(step).encode(), hashlib.sha256).digest()
    return str(int.from_bytes(digest[:4], "big") % 10**CODE_DIGITS).zfill(CODE_DIGITS)


def current(secret, at=None):
    """Return (code, seconds until it changes)."""
    at = time.time() if at is None else at
    step = int(at // CODE_STEP_SECONDS)
    return _code(secret, step), CODE_STEP_SECONDS - int(at % CODE_STEP_SECONDS)


def verify(secret, code, at=None):
    """Accept the current code and the one before it, so a slow typist isn't punished."""
    at = time.time() if at is None else at
    step = int(at // CODE_STEP_SECONDS)
    code = str(code).strip()
    return any(hmac.compare_digest(_code(secret, step - back), code) for back in (0, 1))
