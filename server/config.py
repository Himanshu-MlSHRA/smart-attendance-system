import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATASET_DIR = os.path.join(ROOT, "dataset")
MODEL_PATH = os.path.join(ROOT, "trained_model", "model.pkl")
ATTENDANCE_CSV = os.path.join(ROOT, "attendance.csv")
DB_PATH = os.environ.get("DB_PATH", os.path.join(ROOT, "attendance.db"))
WEB_DIST = os.path.join(ROOT, "web", "dist")

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
TOKEN_MAX_AGE = 60 * 60 * 12  # seconds

DEFAULT_ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

# Lower is stricter. face_recognition's default is 0.6, which is loose for a classroom.
MATCH_TOLERANCE = float(os.environ.get("MATCH_TOLERANCE", "0.5"))

# Below this share of class days a student is flagged as a defaulter.
DEFAULTER_THRESHOLD = 75
