"""Present! — Smart Attendance System API."""
import os
import shutil

from flask import Flask, jsonify, send_from_directory
from werkzeug.exceptions import HTTPException

from . import config
from . import db as store
from .errors import ApiError


def _bootstrap_data_dir(app):
    """When DATA_DIR is a fresh disk, start it with the dataset and model shipped in the repo."""
    dataset, model = app.config["DATASET_DIR"], app.config["MODEL_PATH"]
    if not os.path.exists(dataset) and os.path.isdir(config.BUNDLED_DATASET_DIR):
        shutil.copytree(config.BUNDLED_DATASET_DIR, dataset)
    if not os.path.exists(model) and os.path.exists(config.BUNDLED_MODEL_PATH):
        os.makedirs(os.path.dirname(model), exist_ok=True)
        shutil.copy2(config.BUNDLED_MODEL_PATH, model)


def create_app(overrides=None, recognizer=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        MAX_CONTENT_LENGTH=32 * 1024 * 1024,
        DB_PATH=config.DB_PATH,
        DATASET_DIR=config.DATASET_DIR,
        MODEL_PATH=config.MODEL_PATH,
        UNKNOWN_DIR=config.UNKNOWN_DIR,
        SEED_DEMO=config.SEED_DEMO,
    )
    app.config.update(overrides or {})

    if recognizer is None:
        _bootstrap_data_dir(app)
        from .recognizer import Recognizer
        recognizer = Recognizer(app.config["MODEL_PATH"], app.config["DATASET_DIR"])
    app.extensions["recognizer"] = recognizer

    store.init_db(app.config["DB_PATH"], app.config["DATASET_DIR"], seed_demo=app.config["SEED_DEMO"])
    app.teardown_appcontext(store.close_db)

    from .routes import admin, auth, courses, me, records, requests, sessions, students
    for module in (auth, students, courses, sessions, records, requests, me, admin):
        app.register_blueprint(module.bp)

    @app.errorhandler(ApiError)
    def handle_api_error(err):
        return jsonify({"error": err.message}), err.status

    @app.errorhandler(HTTPException)
    def handle_http_error(err):
        return jsonify({"error": err.description}), err.code

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True})

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def frontend(path):
        if path.startswith("api/"):
            raise ApiError("Not found.", 404)
        if not os.path.isdir(config.WEB_DIST):
            return "Frontend not built. Run `npm run build` in web/, or use `npm run dev` there.", 404
        if path and os.path.exists(os.path.join(config.WEB_DIST, path)):
            return send_from_directory(config.WEB_DIST, path)
        return send_from_directory(config.WEB_DIST, "index.html")

    if config.SECRET_KEY == "dev-secret-change-me" and not app.testing:
        app.logger.warning("SECRET_KEY is the development default. Set it in production.")

    return app
