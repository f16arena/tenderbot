"""Регистрация / вход / выход / профиль."""
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify

from auth import (
    hash_password, verify_password,
    login_user, logout_user, current_user,
    login_required, active_subscription,
)
from db.database import get_session
from db.models import User, Plan, Subscription


auth_bp = Blueprint("auth", __name__, url_prefix="/auth")
me_bp = Blueprint("me", __name__, url_prefix="/me")
public_bp = Blueprint("public", __name__)


# ── /auth ──────────────────────────────────────────────────────────────────

@auth_bp.route("/signup", methods=["POST"])
def signup():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or "@" not in email or len(password) < 8:
        return jsonify({"error": "invalid_input", "message": "Нужны email и пароль ≥8 символов"}), 400

    db = get_session()
    if db.query(User).filter_by(email=email).first():
        return jsonify({"error": "email_taken"}), 409

    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=data.get("full_name") or "",
        company=data.get("company") or "",
        bin=data.get("bin") or "",
        phone=data.get("phone") or "",
        role="client",
    )
    db.add(user)
    db.flush()

    # Авто-выдача триала Starter
    starter = db.query(Plan).filter_by(code="starter").first()
    if starter:
        sub = Subscription(
            user_id=user.id,
            plan_id=starter.id,
            status="trial",
            started_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=starter.trial_days),
        )
        db.add(sub)
    db.commit()
    login_user(user)
    return jsonify({"ok": True, "user": _user_dict(user)})


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    db = get_session()
    user = db.query(User).filter_by(email=email).first()
    if not user or not verify_password(password, user.password_hash):
        return jsonify({"error": "invalid_credentials"}), 401
    if not user.is_active:
        return jsonify({"error": "disabled"}), 403
    user.last_login_at = datetime.utcnow()
    db.commit()
    login_user(user)
    return jsonify({"ok": True, "user": _user_dict(user)})


@auth_bp.route("/logout", methods=["POST"])
def logout():
    logout_user()
    return jsonify({"ok": True})


@auth_bp.route("/me")
def whoami():
    u = current_user()
    if not u:
        return jsonify({"authenticated": False})
    sub = active_subscription(u)
    return jsonify({
        "authenticated": True,
        "user": _user_dict(u),
        "subscription": _sub_dict(sub) if sub else None,
    })


def _user_dict(u: User):
    return {
        "id": u.id, "email": u.email, "full_name": u.full_name,
        "company": u.company, "bin": u.bin, "phone": u.phone, "role": u.role,
    }


def _sub_dict(s: Subscription):
    return {
        "status": s.status,
        "plan_code": s.plan.code,
        "plan_name": s.plan.name,
        "expires_at": s.expires_at.isoformat() if s.expires_at else None,
    }


# ── /me (кабинет) ──────────────────────────────────────────────────────────

@me_bp.route("/filters", methods=["GET"])
@login_required
def list_filters():
    from db.models import Filter
    u = current_user()
    db = get_session()
    fs = db.query(Filter).filter_by(user_id=u.id).all()
    return jsonify([_filter_dict(f) for f in fs])


@me_bp.route("/filters", methods=["POST"])
@login_required
def create_filter():
    from db.models import Filter
    u = current_user()
    data = request.json or {}

    # Проверка лимита фильтров по тарифу
    sub = active_subscription(u)
    if not sub:
        return jsonify({"error": "no_subscription"}), 402
    db = get_session()
    plan = db.query(Plan).get(sub.plan_id)
    used = db.query(Filter).filter_by(user_id=u.id).count()
    if plan.max_filters and used >= plan.max_filters:
        return jsonify({"error": "filter_limit_reached", "limit": plan.max_filters}), 402

    f = Filter(
        user_id=u.id,
        name=data.get("name", "Без названия"),
        categories=data.get("categories") or [],
        regions=data.get("regions") or [],
        platforms=data.get("platforms") or [],
        keywords=data.get("keywords", ""),
        min_price=float(data.get("min_price") or 0),
        max_price=float(data.get("max_price") or 1_000_000_000),
        enabled=bool(data.get("enabled", True)),
    )
    db.add(f)
    db.commit()
    return jsonify(_filter_dict(f))


@me_bp.route("/filters/<int:fid>", methods=["PUT"])
@login_required
def update_filter(fid: int):
    from db.models import Filter
    u = current_user()
    db = get_session()
    f = db.query(Filter).filter_by(id=fid, user_id=u.id).first()
    if not f:
        return jsonify({"error": "not_found"}), 404
    data = request.json or {}
    for field in ("name", "keywords"):
        if field in data:
            setattr(f, field, data[field])
    for field in ("categories", "regions", "platforms"):
        if field in data:
            setattr(f, field, data[field] or [])
    if "min_price" in data: f.min_price = float(data["min_price"] or 0)
    if "max_price" in data: f.max_price = float(data["max_price"] or 1_000_000_000)
    if "enabled" in data:   f.enabled = bool(data["enabled"])
    db.commit()
    return jsonify(_filter_dict(f))


@me_bp.route("/filters/<int:fid>", methods=["DELETE"])
@login_required
def delete_filter(fid: int):
    from db.models import Filter
    u = current_user()
    db = get_session()
    f = db.query(Filter).filter_by(id=fid, user_id=u.id).first()
    if not f:
        return jsonify({"error": "not_found"}), 404
    db.delete(f)
    db.commit()
    return jsonify({"ok": True})


@me_bp.route("/lots")
@login_required
def my_lots():
    """Лоты, попадающие под включённые фильтры пользователя."""
    from db.models import Lot, Filter
    u = current_user()
    db = get_session()
    fs = db.query(Filter).filter_by(user_id=u.id, enabled=True).all()
    if not fs:
        # Без фильтров — пусто (явная подсказка клиенту, что нужно настроить)
        return jsonify([])

    q = db.query(Lot)
    # Объединяем условия фильтров через OR — лот подходит, если матчит ХОТЯ БЫ один
    from sqlalchemy import or_, and_
    clauses = []
    for f in fs:
        sub = [Lot.price >= (f.min_price or 0), Lot.price <= (f.max_price or 1e12)]
        if f.platforms:  sub.append(Lot.platform.in_(f.platforms))
        if f.categories: sub.append(Lot.category.in_(f.categories))
        if f.regions:    sub.append(Lot.region.in_(f.regions))
        if f.keywords:
            kw_clauses = [Lot.title.ilike(f"%{k.strip()}%") for k in f.keywords.split(",") if k.strip()]
            if kw_clauses:
                sub.append(or_(*kw_clauses))
        clauses.append(and_(*sub))
    if clauses:
        q = q.filter(or_(*clauses))
    q = q.order_by(Lot.created_at.desc()).limit(200)
    return jsonify([{
        "id": l.lot_id, "platform": l.platform, "title": l.title,
        "category": l.category, "region": l.region, "price": l.price,
        "deadline": l.deadline.isoformat() if l.deadline else None,
        "url": l.url, "status": l.status,
    } for l in q.all()])


@me_bp.route("/subscribe", methods=["POST"])
@login_required
def subscribe():
    """Заявка на смену тарифа. На MVP — статус 'pending', активирует админ вручную."""
    data = request.json or {}
    plan_code = data.get("plan")
    db = get_session()
    plan = db.query(Plan).filter_by(code=plan_code).first()
    if not plan:
        return jsonify({"error": "plan_not_found"}), 404
    u = current_user()
    sub = Subscription(
        user_id=u.id, plan_id=plan.id,
        status="pending_payment",
        started_at=datetime.utcnow(),
    )
    db.add(sub)
    db.commit()
    # На этом этапе должен быть редирект на Kaspi Pay; пока возвращаем инструкции
    return jsonify({
        "ok": True,
        "next": "manual_invoice",
        "message": "Заявка принята. Скоро с вами свяжется менеджер для выставления счёта (Kaspi/банк).",
    })


def _filter_dict(f):
    return {
        "id": f.id, "name": f.name,
        "categories": f.categories or [], "regions": f.regions or [],
        "platforms": f.platforms or [], "keywords": f.keywords or "",
        "min_price": f.min_price, "max_price": f.max_price, "enabled": f.enabled,
    }


# ── публичные ──────────────────────────────────────────────────────────────

@public_bp.route("/api/plans")
def public_plans():
    db = get_session()
    plans = db.query(Plan).order_by(Plan.sort_order).all()
    return jsonify([{
        "code": p.code, "name": p.name,
        "price_kzt": p.price_kzt, "trial_days": p.trial_days,
        "max_filters": p.max_filters, "channels": p.channels_allowed,
        "api_access": p.api_access, "description": p.description,
    } for p in plans])
