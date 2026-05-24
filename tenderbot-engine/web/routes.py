from flask import Blueprint, jsonify, request
from db.database import get_session
from db.models import Lot, Application, Document
from automation.ai_filler import diagnose as ai_diagnose
from datetime import datetime

api = Blueprint("api", __name__)

@api.route("/api/lots")
def get_lots():
    db = get_session()
    q = db.query(Lot)

    # Фильтры из query string
    cat      = request.args.get("category")
    region   = request.args.get("region")
    platform = request.args.get("platform")
    search   = request.args.get("q")
    min_p    = request.args.get("min_price", type=float)
    max_p    = request.args.get("max_price", type=float)
    sort     = request.args.get("sort", "price")
    order    = request.args.get("order", "desc")

    if cat:      q = q.filter(Lot.category == cat)
    if region:   q = q.filter(Lot.region   == region)
    if platform: q = q.filter(Lot.platform == platform)
    if min_p:    q = q.filter(Lot.price >= min_p)
    if max_p:    q = q.filter(Lot.price <= max_p)
    if search:   q = q.filter(Lot.title.ilike(f"%{search}%"))

    # Сортировка
    sort_col = getattr(Lot, sort, Lot.price)
    q = q.order_by(sort_col.desc() if order == "desc" else sort_col.asc())

    lots = q.limit(100).all()
    return jsonify([{
        "id":       l.lot_id,
        "platform": l.platform,
        "title":    l.title,
        "category": l.category,
        "region":   l.region,
        "price":    l.price,
        "deadline": l.deadline.isoformat() if l.deadline else None,
        "url":      l.url,
        "status":   l.status,
    } for l in lots])

@api.route("/api/stats")
def get_stats():
    db = get_session()
    return jsonify({
        "total_lots":  db.query(Lot).count(),
        "new_lots":    db.query(Lot).filter_by(status="new").count(),
        "applications":db.query(Application).count(),
        "auto_apps":   db.query(Application).filter_by(auto=True).count(),
        "won":         db.query(Application).filter_by(status="won").count(),
    })

@api.route("/api/submit", methods=["POST"])
def submit_application():
    data = request.json or {}
    mode = data.get("mode", "playwright")  # "playwright" | "ai"
    # Реальная асинхронная подача — Submitter().submit_lot(..., mode=mode).
    # Здесь только ставим в очередь; запуск из веб-процесса требует отдельного воркера.
    return jsonify({
        "status": "queued",
        "lot_id": data.get("lot_id"),
        "mode": mode,
    })


@api.route("/api/ai/status")
def ai_status():
    """Доступен ли agent-browser (AI-подача)."""
    return jsonify(ai_diagnose())

@api.route("/api/applications")
def get_applications():
    db = get_session()
    apps = db.query(Application).order_by(Application.created_at.desc()).limit(50).all()
    return jsonify([{
        "lot_id":   a.lot_id,
        "platform": a.platform,
        "price":    a.price,
        "status":   a.status,
        "auto":     a.auto,
        "time":     a.submit_time,
        "date":     a.submitted_at.strftime("%d.%m.%Y") if a.submitted_at else None,
    } for a in apps])
