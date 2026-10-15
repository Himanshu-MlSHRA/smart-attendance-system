import io
import sqlite3

from server import codes, stats
from server import db as store

from .conftest import course_id, current_code, frame, login


# ---------------------------------------------------------------- auth

def test_wrong_password_is_rejected_then_throttled(client):
    for _ in range(5):
        assert client.post("/api/auth/login", json={"username": "admin", "password": "nope"}).status_code == 401
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 429


def test_password_change_signs_out_old_tokens(client, student):
    r = client.post("/api/auth/password", headers=student, json={"current": "1001", "new": "s3cret!"})
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=student).status_code == 401
    fresh = {"Authorization": f"Bearer {r.json['token']}"}
    assert client.get("/api/auth/me", headers=fresh).json["username"] == "1001"


def test_new_students_must_change_their_starting_password(client, admin):
    client.post("/api/students", headers=admin, json={"name": "New Kid", "roll_number": "2001", "department": "IT"})
    r = client.post("/api/auth/login", json={"username": "2001", "password": "2001"})
    assert r.json["user"]["must_change_password"] is True


def test_roles_are_enforced(client, student, teacher):
    assert client.get("/api/stats", headers=student).status_code == 403
    assert client.post("/api/students", headers=teacher, json={}).status_code == 403
    assert client.get("/api/stats").status_code == 401


def test_teachers_only_see_their_own_courses(client, teacher, admin):
    assert [c["code"] for c in client.get("/api/courses", headers=teacher).json] == ["ML1"]
    assert len(client.get("/api/courses", headers=admin).json) == 2
    other = course_id(client, admin, "WEB1")
    assert client.post(f"/api/courses/{other}/sessions", headers=teacher, json={}).status_code == 403


# ---------------------------------------------------------------- classes and scanning

def start(client, headers, code="ML1", **kw):
    r = client.post(f"/api/courses/{course_id(client, headers, code)}/sessions", headers=headers, json=kw)
    assert r.status_code == 201, r.json
    return r.json["id"]


def test_scan_marks_roster_students_once(client, teacher, fake):
    sid = start(client, teacher)
    fake.faces = [("1001", 0.3), (None, 0.7)]
    faces = client.post(f"/api/sessions/{sid}/scan", headers=teacher, json={"image": frame()}).json["faces"]
    assert [f["status"] for f in faces] == ["marked", "unknown"]
    faces = client.post(f"/api/sessions/{sid}/scan", headers=teacher, json={"image": frame()}).json["faces"]
    assert faces[0]["status"] == "already"
    detail = client.get(f"/api/sessions/{sid}", headers=teacher).json
    assert detail["counts"]["present"] == 1 and detail["counts"]["waiting"] == 1
    assert len(detail["code"]) == 4


def test_one_running_class_per_course_and_closed_classes_refuse_scans(client, teacher, fake):
    sid = start(client, teacher)
    assert client.post(f"/api/courses/{course_id(client, teacher, 'ML1')}/sessions", headers=teacher, json={}).status_code == 409
    client.post(f"/api/sessions/{sid}/close", headers=teacher)
    fake.faces = [("1001", 0.3)]
    assert client.post(f"/api/sessions/{sid}/scan", headers=teacher, json={"image": frame()}).status_code == 409


def test_absence_is_counted_only_after_class_ends(client, teacher, student):
    sid = start(client, teacher)
    assert client.get("/api/me/attendance", headers=student).json["overall"]["held"] == 0
    client.post(f"/api/sessions/{sid}/close", headers=teacher)
    overall = client.get("/api/me/attendance", headers=student).json["overall"]
    assert (overall["absent"], overall["percent"], overall["defaulter"]) == (1, 0, True)


def test_manual_override_is_audited(client, teacher, admin):
    sid = start(client, teacher)
    students = {s["roll_number"]: s["id"] for s in client.get("/api/students", headers=teacher).json}
    r = client.put(f"/api/sessions/{sid}/attendance/{students['1002']}", headers=teacher, json={"status": "late"})
    assert r.status_code == 200
    assert client.put(f"/api/sessions/{sid}/attendance/{students['1002']}", headers=teacher,
                      json={"status": "absent"}).status_code == 200
    actions = [a["action"] for a in client.get("/api/audit", headers=admin).json]
    assert actions.count("attendance.set") == 2


# ---------------------------------------------------------------- self check-in

def test_self_checkin_needs_the_classroom_code(app, client, teacher, student, fake):
    sid = start(client, teacher)
    fake.liveness["roll"] = "1001"
    bad = "0000" if current_code(app, sid) != "0000" else "1111"
    r = client.post("/api/me/checkin", headers=student, json={"session_id": sid, "code": bad, "frames": [frame()]})
    assert r.status_code == 403
    r = client.post("/api/me/checkin", headers=student,
                    json={"session_id": sid, "code": current_code(app, sid), "frames": [frame()]})
    assert r.status_code == 200 and r.json["status"] == "marked"


def test_self_checkin_rejects_photos_and_other_faces(app, client, teacher, student, fake):
    sid = start(client, teacher)
    body = {"session_id": sid, "code": current_code(app, sid), "frames": [frame()]}
    fake.liveness.update(roll="1001", blinked=False)
    assert client.post("/api/me/checkin", headers=student, json=body).status_code == 422
    fake.liveness.update(roll="1002", blinked=True)
    assert client.post("/api/me/checkin", headers=student, json=body).status_code == 403


def test_code_guessing_is_locked_out(app, client, teacher, student):
    sid = start(client, teacher)
    real = current_code(app, sid)
    wrong = [c for c in ("0001", "0002", "0003", "0004", "0005", "0006") if c != real][:5]
    for code in wrong:
        client.post("/api/me/checkin", headers=student, json={"session_id": sid, "code": code, "frames": [frame()]})
    r = client.post("/api/me/checkin", headers=student, json={"session_id": sid, "code": real, "frames": [frame()]})
    assert r.status_code == 429


def test_codes_rotate_and_expire():
    secret = codes.new_secret()
    code, _ = codes.current(secret, at=1_000_000)
    assert codes.verify(secret, code, at=1_000_000)
    assert codes.verify(secret, code, at=1_000_000 + 30)  # previous window still accepted
    assert not codes.verify(secret, code, at=1_000_000 + 90)


# ---------------------------------------------------------------- requests

def test_approved_leave_excuses_the_absence(client, teacher, student):
    sid = start(client, teacher)
    client.post(f"/api/sessions/{sid}/close", headers=teacher)
    r = client.post("/api/me/requests", headers=student, json={"session_id": sid, "kind": "leave", "reason": "Fever, doctor's note"})
    assert r.status_code == 201
    assert client.post("/api/me/requests", headers=student,
                       json={"session_id": sid, "kind": "leave", "reason": "again!"}).status_code == 409
    client.post(f"/api/requests/{r.json['id']}/decide", headers=teacher, json={"approve": True})
    overall = client.get("/api/me/attendance", headers=student).json["overall"]
    assert (overall["excused"], overall["held"], overall["percent"]) == (1, 0, None)


def test_only_the_course_teacher_decides(client, admin, student):
    t2 = login(client, "t.two", "teacher123")
    sid = start(client, t2, code="WEB1")
    client.post(f"/api/sessions/{sid}/close", headers=t2)
    rid = client.post("/api/me/requests", headers=student,
                      json={"session_id": sid, "kind": "correction", "reason": "I was in the back row"}).json["id"]
    t1 = login(client, "t.one", "teacher123")
    assert client.post(f"/api/requests/{rid}/decide", headers=t1, json={"approve": True}).status_code == 404
    assert client.post(f"/api/requests/{rid}/decide", headers=admin, json={"approve": True}).status_code == 200


# ---------------------------------------------------------------- admin tools

def test_csv_import_reports_bad_rows(client, admin):
    csv_text = "name,roll_number,department,courses\nCara,3001,IT,ML1\n,3002,IT,\nAsha again,1001,IT,\n"
    r = client.post("/api/students/import", headers=admin,
                    data={"file": (io.BytesIO(csv_text.encode()), "s.csv")}, content_type="multipart/form-data")
    assert r.json["created"] == ["3001"]
    assert [s["line"] for s in r.json["skipped"]] == [3, 4]


def test_register_csv(client, teacher, fake):
    sid = start(client, teacher)
    fake.faces = [("1001", 0.3)]
    client.post(f"/api/sessions/{sid}/scan", headers=teacher, json={"image": frame()})
    client.post(f"/api/sessions/{sid}/close", headers=teacher)
    text = client.get(f"/api/courses/{course_id(client, teacher, 'ML1')}/report.csv", headers=teacher).get_data(as_text=True)
    lines = text.strip().splitlines()
    assert lines[1].startswith("1001,Asha Rao,P,1,1,100")
    assert lines[2].startswith("1002,Bilal Khan,A,0,1,0,yes")


def test_defaulter_alerts_dry_run(client, teacher):
    sid = start(client, teacher)
    client.post(f"/api/sessions/{sid}/close", headers=teacher)
    r = client.post("/api/alerts/defaulters", headers=teacher, json={})
    assert r.json["dry_run"] is True
    assert {p["roll_number"] for p in r.json["preview"]} == {"1001", "1002"}


def test_deleting_a_student_forgets_their_face(client, admin, fake):
    sid = next(s["id"] for s in client.get("/api/students", headers=admin).json if s["roll_number"] == "1002")
    client.delete(f"/api/students/{sid}", headers=admin)
    assert "1002" not in fake.known_rolls


# ---------------------------------------------------------------- arithmetic and migration

def test_summary_math():
    s = stats.summarize(present=6, late=2, excused=1, absent=2)
    assert (s["attended"], s["held"], s["percent"], s["defaulter"]) == (8, 10, 80, False)
    assert stats.summarize()["percent"] is None


def test_streak_ignores_excused():
    rows = [{"status": s} for s in ["present", "absent", "present", "excused", "late", "present"]]
    assert stats.streaks(rows) == (3, 3)


def test_v1_database_is_migrated(tmp_path):
    path = str(tmp_path / "v1.db")
    db = sqlite3.connect(path)
    db.executescript("""
        CREATE TABLE students (id INTEGER PRIMARY KEY, roll_number TEXT, name TEXT, department TEXT, created_at TEXT);
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT, role TEXT, student_id INTEGER);
        CREATE TABLE attendance (id INTEGER PRIMARY KEY, student_id INTEGER, date TEXT, time TEXT, method TEXT);
        INSERT INTO students VALUES (1, '42', 'Old Timer', 'IT', '2025-01-01');
        INSERT INTO users VALUES (1, 'admin', 'x', 'admin', NULL), (2, '42', 'y', 'student', 1);
        INSERT INTO attendance VALUES (1, 1, '2025-04-24', '14:20:46', 'camera');
    """)
    db.commit()
    db.close()
    store.init_db(path, str(tmp_path))
    db = store.connect(path)
    row = db.execute(
        "SELECT c.code, s.date, a.status FROM attendance a JOIN sessions s ON s.id = a.session_id JOIN courses c ON c.id = s.course_id"
    ).fetchone()
    assert tuple(row) == ("GEN101", "2025-04-24", "present")
    assert db.execute("SELECT name FROM users WHERE id = 2").fetchone()[0] == "Old Timer"


def test_migrated_database_gets_working_demo_accounts(tmp_path, fake):
    """An old database upgraded with demo mode on must end up with the demo logins the login page offers."""
    from server import create_app

    path = str(tmp_path / "v1.db")
    db = sqlite3.connect(path)
    db.executescript("""
        CREATE TABLE students (id INTEGER PRIMARY KEY, roll_number TEXT, name TEXT, department TEXT, created_at TEXT);
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT, role TEXT, student_id INTEGER);
        CREATE TABLE attendance (id INTEGER PRIMARY KEY, student_id INTEGER, date TEXT, time TEXT, method TEXT);
    """)
    db.commit()
    db.close()
    app = create_app({"TESTING": True, "DB_PATH": path, "DATASET_DIR": str(tmp_path / "ds"),
                      "MODEL_PATH": str(tmp_path / "m.pkl"), "UNKNOWN_DIR": str(tmp_path / "u"), "SEED_DEMO": True},
                     recognizer=fake)
    client = app.test_client()
    demo = client.get("/api/auth/demo").json
    assert {d["label"] for d in demo} == {"Teacher", "Student"}  # the v1 admin had no known password
    for d in demo:
        assert client.post("/api/auth/login", json={"username": d["username"], "password": d["password"]}).status_code == 200
    # Restarting must not seed twice.
    create_app({"TESTING": True, "DB_PATH": path, "DATASET_DIR": str(tmp_path / "ds"), "MODEL_PATH": str(tmp_path / "m.pkl"),
                "UNKNOWN_DIR": str(tmp_path / "u"), "SEED_DEMO": True}, recognizer=fake)
    db = store.connect(path)
    assert db.execute("SELECT COUNT(*) FROM courses").fetchone()[0] == 5  # GEN101 + 4 demo courses
