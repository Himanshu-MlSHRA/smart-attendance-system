"""Settings, all overridable with environment variables."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Everything the app writes (database, face photos, model) lives under DATA_DIR.
# Point it at a mounted disk in production so data survives redeploys.
DATA_DIR = os.environ.get("DATA_DIR", ROOT)
DATASET_DIR = os.path.join(DATA_DIR, "dataset")
MODEL_PATH = os.path.join(DATA_DIR, "trained_model", "model.pkl")
UNKNOWN_DIR = os.path.join(DATA_DIR, "unknown_faces")
DB_PATH = os.environ.get("DB_PATH", os.path.join(DATA_DIR, "attendance.db"))

# Shipped with the repo: the original dataset and attendance log, imported on first run.
BUNDLED_DATASET_DIR = os.path.join(ROOT, "dataset")
BUNDLED_MODEL_PATH = os.path.join(ROOT, "trained_model", "model.pkl")
ATTENDANCE_CSV = os.path.join(ROOT, "attendance.csv")
WEB_DIST = os.path.join(ROOT, "web", "dist")

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
TOKEN_MAX_AGE = 60 * 60 * 12  # seconds

DEFAULT_ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

# Fill a brand-new database with demo courses, teachers and two months of history.
SEED_DEMO = os.environ.get("SEED_DEMO", "1") == "1"

# Wall-clock time zone for dates and times. Servers usually run in UTC.
TIMEZONE = os.environ.get("TIMEZONE", "Asia/Kolkata")

# Lower is stricter. face_recognition's default is 0.6, which is loose for a classroom.
MATCH_TOLERANCE = float(os.environ.get("MATCH_TOLERANCE", "0.5"))

# Below this share of classes a student is flagged as a defaulter.
DEFAULTER_THRESHOLD = int(os.environ.get("DEFAULTER_THRESHOLD", "75"))

# Arriving more than this many minutes after a class starts counts as late.
LATE_AFTER_MINUTES = int(os.environ.get("LATE_AFTER_MINUTES", "10"))

# Self check-in needs the code on the classroom screen; it rotates this often.
CODE_STEP_SECONDS = 30
CODE_DIGITS = 4
MAX_CODE_ATTEMPTS = 5

# Self check-in also needs a blink across a burst of frames (stops printed photos).
LIVENESS = os.environ.get("LIVENESS", "1") == "1"

# Login throttling: this many failures from one address locks it out for the window.
LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW_SECONDS = 5 * 60

# Defaulter alert emails. Without SMTP_HOST the alert endpoint does a dry run.
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "attendance@present.local")
