# Flask веб-сервер дашборда.
import os
import secrets
from datetime import timedelta

from flask import Flask, send_from_directory
from flask_cors import CORS

from web.routes import api
from web.auth_routes import auth_bp, me_bp, public_bp

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


def _load_or_create_secret() -> str:
    """Стабильный secret_key между перезапусками — иначе сессии слетают."""
    path = os.path.join(os.path.dirname(__file__), "..", ".flask_secret")
    if os.path.exists(path):
        return open(path, "r").read().strip()
    secret = secrets.token_hex(32)
    with open(path, "w") as f:
        f.write(secret)
    return secret


def create_app() -> Flask:
    app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="/static")
    app.secret_key = _load_or_create_secret()
    app.permanent_session_lifetime = timedelta(days=30)
    CORS(app, supports_credentials=True)

    app.register_blueprint(api)
    app.register_blueprint(auth_bp)
    app.register_blueprint(me_bp)
    app.register_blueprint(public_bp)

    @app.route("/")
    def index():
        # SPA: одна страница, маршруты разруливает фронт по аутентификации.
        return send_from_directory(STATIC_DIR, "index.html")

    @app.route("/health")
    def health():
        return {"status": "ok"}

    return app
