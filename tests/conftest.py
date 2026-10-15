import base64
import io

import numpy as np
import pytest
from PIL import Image

from server import codes, create_app
from server import db as store
from server.auth import login_throttle
from server.routes.me import code_throttle


class FakeRecognizer:
    """Stands in for face_recognition: tests decide what the 'camera' sees."""

    def __init__(self):
        self.rolls = []
        self.faces = []  # what identify() returns: [(roll or None, distance)]
        self.liveness = {"faces": 3, "blinked": True, "roll": None, "distance": 0.3, "box": None}

    @property
    def known_rolls(self):
        return set(self.rolls)

    def photo_path(self, roll):
        return None

    def identify(self, image):
        box = {"top": 0.1, "left": 0.1, "bottom": 0.4, "right": 0.4}
        return [{"roll": r, "distance": d, "box": box, "encoding": np.zeros(128)} for r, d in self.faces]

    def check_liveness(self, images):
        return dict(self.liveness)

    def enroll(self, roll, images):
        self.rolls.append(roll)
        return len(images)

    def add_face(self, roll, image, encoding, save=True):
        self.rolls.append(roll)

    def forget(self, roll):
        self.rolls = [r for r in self.rolls if r != roll]

    def train(self, allowed_rolls=None):
        return len(self.rolls), len(set(self.rolls))


def frame():
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), "white").save(buf, "JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


@pytest.fixture
def fake():
    return FakeRecognizer()


@pytest.fixture
def app(tmp_path, fake):
    login_throttle.hits.clear()
    code_throttle.hits.clear()
    app = create_app(
        {
            "TESTING": True,
            "DB_PATH": str(tmp_path / "test.db"),
            "DATASET_DIR": str(tmp_path / "dataset"),
            "MODEL_PATH": str(tmp_path / "model.pkl"),
            "UNKNOWN_DIR": str(tmp_path / "unknown"),
            "SEED_DEMO": False,
        },
        recognizer=fake,
    )
    # A small school: one teacher with one course, another teacher's course, two students.
    db = store.connect(app.config["DB_PATH"])
    t1 = store.create_user(db, "t.one", "teacher123", "teacher", "Teacher One")
    t2 = store.create_user(db, "t.two", "teacher123", "teacher", "Teacher Two")
    s1 = store.create_student(db, "1001", "Asha Rao", "IT", "asha@example.edu", must_change_password=False)
    s2 = store.create_student(db, "1002", "Bilal Khan", "IT", must_change_password=False)
    for code, teacher in (("ML1", t1), ("WEB1", t2)):
        cur = db.execute(
            "INSERT INTO courses (code, name, department, teacher_id, created_at) VALUES (?, ?, 'IT', ?, '2026-01-01')",
            (code, code.title(), teacher),
        )
        db.executemany("INSERT INTO course_students VALUES (?, ?)", [(cur.lastrowid, s1), (cur.lastrowid, s2)])
    db.commit()
    db.close()
    fake.rolls = ["1001", "1002"]
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def login(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.json
    return {"Authorization": f"Bearer {r.json['token']}"}


@pytest.fixture
def admin(client):
    return login(client, "admin", "admin123")


@pytest.fixture
def teacher(client):
    return login(client, "t.one", "teacher123")


@pytest.fixture
def student(client):
    return login(client, "1001", "1001")


def course_id(client, headers, code):
    return next(c["id"] for c in client.get("/api/courses", headers=headers).json if c["code"] == code)


def current_code(app, session_id):
    db = store.connect(app.config["DB_PATH"])
    secret = db.execute("SELECT secret FROM sessions WHERE id = ?", (session_id,)).fetchone()["secret"]
    db.close()
    return codes.current(secret)[0]
