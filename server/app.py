"""WSGI entry point.

Run with:  python -m server.app          (development)
           gunicorn server.app:app       (production, one worker)
"""
import os

from . import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 10000)), debug=bool(os.environ.get("DEBUG")))
