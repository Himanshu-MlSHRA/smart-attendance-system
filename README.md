# Present! — Smart Attendance System

Face-recognition attendance with a React front end.

- **Python (`server/`)** — Flask API, SQLite storage, and all face work via `face_recognition` (dlib).
- **React (`web/`)** — Vite + React + TypeScript, Tailwind v4, [Motion](https://motion.dev) for animation. Neo-brutalist look.

The browser opens the webcam and sends frames to the API; Python finds and matches faces and marks attendance.

## Who can do what

| Admin | Student |
|---|---|
| Dashboard: today's turnout, 14-day chart, latest check-ins | Attendance %, streak, how many classes they can miss (or need) to stay at 75% |
| **Scanner**: live webcam kiosk, or upload a group photo | **Self check-in** with their face (only counts if it's *their* face) |
| Students: add, enroll a face from the webcam, delete, retrain | Class-day grid and full history |
| Records: filter by date / search, mark manually, delete, export CSV | Change password |

## Logins

- Admin: `admin` / `admin123` (override with `ADMIN_USERNAME` / `ADMIN_PASSWORD` **before the first run**).
- Students: username = roll number, starting password = roll number.

On first start the API creates `attendance.db` and imports students from `dataset/*/metadata.txt` and history from `attendance.csv`.

## Run it locally

```bash
# 1. API (Python 3.12 recommended)
python -m venv server/.venv && source server/.venv/bin/activate
pip install dlib-bin && pip install --no-deps face-recognition   # avoids compiling dlib
pip install -r requirements.txt
python -m server.app                     # http://localhost:10000

# 2. Frontend (another terminal)
cd web && npm install && npm run dev     # http://localhost:5173, proxies /api to :10000
```

The webcam only works on `localhost` or over HTTPS.

## Production

```bash
./render-build.sh                         # installs Python deps and builds web/dist
SECRET_KEY=change-me gunicorn -w 1 --threads 8 -b 0.0.0.0:$PORT server.app:app
```

Flask serves the built frontend from `web/dist`. Keep **one** worker: the face model lives in memory and enrolling updates it in place.

## Config (env vars)

| Var | Default | |
|---|---|---|
| `SECRET_KEY` | `dev-secret-change-me` | Signs login tokens. Set it in production. |
| `PORT` | `10000` | |
| `DB_PATH` | `./attendance.db` | |
| `MATCH_TOLERANCE` | `0.5` | Face distance cut-off. Lower is stricter. |

## Face data

- Enrolling from the Students page saves face crops to `dataset/<roll>/` and adds their encodings to `trained_model/model.pkl` immediately.
- **Retrain model** (or `python -m server.train`) rebuilds the model from everything in `dataset/`.
