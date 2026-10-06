# Lets `gunicorn app:app` (the original Render start command) keep working.
from server.app import app  # noqa: F401
