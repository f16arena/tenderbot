from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db.models import Base, Plan
from config import cfg
import os

# Локально — SQLite, на проде — Postgres (Supabase) через DATABASE_URL.
if cfg.DATABASE_URL:
    db_url = cfg.DATABASE_URL
    # Supabase обычно даёт postgres:// — sqlalchemy v2 требует postgresql://
    if db_url.startswith("postgres://"):
        db_url = "postgresql://" + db_url[len("postgres://"):]
    engine = create_engine(db_url, echo=False, pool_pre_ping=True)
else:
    os.makedirs("db", exist_ok=True)
    engine = create_engine(f"sqlite:///{cfg.DB_PATH}", echo=False)

Session = sessionmaker(bind=engine)


def init_db():
    Base.metadata.create_all(engine)
    _seed_plans()
    print("✅ БД инициализирована")


def get_session():
    return Session()


def _seed_plans():
    """Гарантировать, что 3 тарифа в БД есть. Не перезаписывает существующие цены."""
    s = Session()
    try:
        defaults = [
            dict(
                code="starter", name="Starter",
                price_kzt=10_000, trial_days=7,
                max_filters=1,
                channels_allowed=["telegram", "dashboard"],
                api_access=False,
                description="Один фильтр, уведомления в Telegram. Для индивидуальных предпринимателей и микро-компаний.",
                sort_order=1,
            ),
            dict(
                code="pro", name="Pro",
                price_kzt=30_000, trial_days=7,
                max_filters=0,  # 0 = безлимит
                channels_allowed=["telegram", "email", "dashboard"],
                api_access=False,
                description="Безлимит фильтров, Telegram + Email, приоритетная поддержка. Для МСБ.",
                sort_order=2,
            ),
            dict(
                code="enterprise", name="Enterprise",
                price_kzt=100_000, trial_days=14,
                max_filters=0,
                channels_allowed=["telegram", "email", "whatsapp", "sms", "dashboard"],
                api_access=True,
                description="Всё из Pro + WhatsApp/SMS + REST API для интеграции в ваши системы.",
                sort_order=3,
            ),
        ]
        for d in defaults:
            existing = s.query(Plan).filter_by(code=d["code"]).first()
            if not existing:
                s.add(Plan(**d))
        s.commit()
    finally:
        s.close()
