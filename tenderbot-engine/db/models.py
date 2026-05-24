from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()


# ─── Tenant-агностичные данные (общая БД лотов) ──────────────────────────────

class Lot(Base):
    """Один лот — общий для всех клиентов. Видимость определяется фильтрами клиента."""
    __tablename__ = "lots"

    id           = Column(Integer, primary_key=True)
    lot_id       = Column(String, unique=True, index=True)
    platform     = Column(String, index=True)
    title        = Column(Text)
    category     = Column(String, index=True)
    region       = Column(String, index=True)
    price        = Column(Float, index=True)
    deadline     = Column(DateTime)
    url          = Column(String)
    status       = Column(String, default="new")
    notified     = Column(Boolean, default=False)
    created_at   = Column(DateTime, default=datetime.utcnow, index=True)


# ─── Multi-tenant: пользователи, тарифы, подписки, фильтры ───────────────────

class User(Base):
    """Подписчик SaaS-сервиса."""
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True)
    email           = Column(String, unique=True, index=True, nullable=False)
    password_hash   = Column(String, nullable=False)
    full_name       = Column(String)
    company         = Column(String)
    bin             = Column(String)        # БИН клиента
    phone           = Column(String)
    role            = Column(String, default="client")  # client | admin
    created_at      = Column(DateTime, default=datetime.utcnow)
    last_login_at   = Column(DateTime)
    is_active       = Column(Boolean, default=True)

    subscriptions   = relationship("Subscription", back_populates="user", cascade="all, delete-orphan")
    filters         = relationship("Filter", back_populates="user", cascade="all, delete-orphan")
    channels        = relationship("NotificationChannel", back_populates="user", cascade="all, delete-orphan")


class Plan(Base):
    """Тарифный план."""
    __tablename__ = "plans"

    id                   = Column(Integer, primary_key=True)
    code                 = Column(String, unique=True)         # "starter" | "pro" | "enterprise"
    name                 = Column(String)
    price_kzt            = Column(Integer)                      # цена за месяц в тенге
    trial_days           = Column(Integer, default=7)
    max_filters          = Column(Integer, default=1)           # 0 = безлимит
    channels_allowed     = Column(JSON)                         # ["telegram","email","whatsapp","dashboard"]
    api_access           = Column(Boolean, default=False)
    description          = Column(Text)
    sort_order           = Column(Integer, default=0)


class Subscription(Base):
    """Активная (или истекшая) подписка пользователя на тариф."""
    __tablename__ = "subscriptions"

    id           = Column(Integer, primary_key=True)
    user_id      = Column(Integer, ForeignKey("users.id"), index=True)
    plan_id      = Column(Integer, ForeignKey("plans.id"))
    status       = Column(String, default="trial")  # trial | active | expired | cancelled
    started_at   = Column(DateTime, default=datetime.utcnow)
    expires_at   = Column(DateTime)
    payment_ref  = Column(String)                   # ID платежа (Kaspi/банк)
    auto_renew   = Column(Boolean, default=False)

    user         = relationship("User", back_populates="subscriptions")
    plan         = relationship("Plan")


class Filter(Base):
    """Сохранённый поисковый фильтр клиента (под него мониторим и шлём уведомления)."""
    __tablename__ = "filters"

    id           = Column(Integer, primary_key=True)
    user_id      = Column(Integer, ForeignKey("users.id"), index=True)
    name         = Column(String)                      # "Стройка Алматы"
    categories   = Column(JSON)                        # ["строительство","ремонт"]
    regions      = Column(JSON)                        # ["Алматы","Астана"]
    platforms    = Column(JSON)                        # ["GOZ","SAM"]
    keywords     = Column(Text)                        # "ремонт,котельная,подстанция"
    min_price    = Column(Float, default=0)
    max_price    = Column(Float, default=1_000_000_000)
    enabled      = Column(Boolean, default=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    user         = relationship("User", back_populates="filters")


class NotificationChannel(Base):
    """Канал уведомлений клиента: Telegram chat, email, whatsapp."""
    __tablename__ = "notification_channels"

    id           = Column(Integer, primary_key=True)
    user_id      = Column(Integer, ForeignKey("users.id"), index=True)
    channel      = Column(String)                      # telegram | email | whatsapp | sms
    target       = Column(String)                      # chat_id / email / phone
    link_code    = Column(String, index=True)          # одноразовый код для привязки Telegram
    verified     = Column(Boolean, default=False)
    enabled      = Column(Boolean, default=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    user         = relationship("User", back_populates="channels")


class SentNotification(Base):
    """Лог отправленных уведомлений (для дедупа: один лот — одно уведомление одному клиенту)."""
    __tablename__ = "sent_notifications"

    id          = Column(Integer, primary_key=True)
    user_id     = Column(Integer, ForeignKey("users.id"), index=True)
    lot_id      = Column(String, index=True)
    channel     = Column(String)
    sent_at     = Column(DateTime, default=datetime.utcnow)


# ─── Совместимость со старым кодом автоподачи ───────────────────────────────

class Application(Base):
    """Заявка, поданная (в идеале — от имени клиента). Сохранено из исходного ТЗ."""
    __tablename__ = "applications"

    id           = Column(Integer, primary_key=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=True)
    lot_id       = Column(String)
    platform     = Column(String)
    title        = Column(Text)
    price        = Column(Float)
    status       = Column(String, default="draft")
    auto         = Column(Boolean, default=True)
    submit_time  = Column(Float)
    submitted_at = Column(DateTime)
    created_at   = Column(DateTime, default=datetime.utcnow)


class Document(Base):
    """Документы из прошлых заявок (для копирования). Сохранено из исходного ТЗ."""
    __tablename__ = "documents"

    id           = Column(Integer, primary_key=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=True)
    name         = Column(String)
    filename     = Column(String)
    doc_type     = Column(String)
    file_path    = Column(String)
    used_count   = Column(Integer, default=0)
    expires_at   = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
