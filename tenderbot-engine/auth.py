"""Простая auth-обвязка для Flask: PBKDF2 хэш + сессии.

Сознательно без сторонних зависимостей (Flask-Login, passlib): минимизируем
поверхность атаки и количество пакетов. Алгоритм PBKDF2-HMAC-SHA256, 200k
итераций — текущая рекомендация OWASP на 2026 год.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime
from functools import wraps

from flask import session, jsonify, g

from db.database import get_session
from db.models import User, Subscription


PBKDF2_ITERATIONS = 200_000
SALT_BYTES = 16


def hash_password(password: str) -> str:
    """Возвращает строку `iterations$salt_hex$hash_hex`."""
    salt = secrets.token_bytes(SALT_BYTES)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        iters_s, salt_hex, hash_hex = stored.split("$")
        iters = int(iters_s)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iters)
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


# ── Session helpers ────────────────────────────────────────────────────────

SESSION_KEY = "uid"


def login_user(user: User):
    session[SESSION_KEY] = user.id
    session.permanent = True


def logout_user():
    session.pop(SESSION_KEY, None)


def current_user() -> User | None:
    uid = session.get(SESSION_KEY)
    if not uid:
        return None
    # Кешируем в g на запрос
    if hasattr(g, "_current_user") and g._current_user and g._current_user.id == uid:
        return g._current_user
    db = get_session()
    user = db.query(User).get(uid)
    g._current_user = user
    return user


def login_required(fn):
    @wraps(fn)
    def wrapped(*a, **kw):
        if not current_user():
            return jsonify({"error": "unauthorized"}), 401
        return fn(*a, **kw)
    return wrapped


def admin_required(fn):
    @wraps(fn)
    def wrapped(*a, **kw):
        u = current_user()
        if not u or u.role != "admin":
            return jsonify({"error": "forbidden"}), 403
        return fn(*a, **kw)
    return wrapped


# ── Subscription helpers ───────────────────────────────────────────────────

def active_subscription(user: User) -> Subscription | None:
    """Возвращает активную/триальную подписку или None."""
    now = datetime.utcnow()
    db = get_session()
    sub = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user.id,
            Subscription.status.in_(["trial", "active"]),
        )
        .order_by(Subscription.started_at.desc())
        .first()
    )
    if sub and sub.expires_at and sub.expires_at < now:
        sub.status = "expired"
        db.commit()
        return None
    return sub
