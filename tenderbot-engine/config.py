import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Организация
    ORG_NAME = os.getenv("ORG_NAME", "ТОО «Компания»")
    ORG_BIN  = os.getenv("ORG_BIN", "")

    # Goszakup
    GOSZAKUP_TOKEN    = os.getenv("GOSZAKUP_TOKEN", "")
    GOSZAKUP_LOGIN    = os.getenv("GOSZAKUP_LOGIN", "")
    GOSZAKUP_PASSWORD = os.getenv("GOSZAKUP_PASSWORD", "")

    # Самрук
    SAMRUK_LOGIN    = os.getenv("SAMRUK_LOGIN", "")
    SAMRUK_PASSWORD = os.getenv("SAMRUK_PASSWORD", "")

    # ЕТК
    ETK_LOGIN    = os.getenv("ETK_LOGIN", "")
    ETK_PASSWORD = os.getenv("ETK_PASSWORD", "")

    # Telegram
    TG_TOKEN   = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TG_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

    # ЭЦП
    ECP_PATH     = os.getenv("ECP_PATH", "")
    ECP_PASSWORD = os.getenv("ECP_PASSWORD", "")

    # Мониторинг
    SCAN_INTERVAL = int(os.getenv("SCAN_INTERVAL_SECONDS", 30))
    MIN_PRICE     = int(os.getenv("MIN_LOT_PRICE", 1_000_000))
    MAX_PRICE     = int(os.getenv("MAX_LOT_PRICE", 500_000_000))
    KEYWORDS      = os.getenv("KEYWORDS", "").split(",")
    REGIONS       = os.getenv("REGIONS", "").split(",")

    # Веб-дашборд
    WEB_HOST = os.getenv("WEB_HOST", "0.0.0.0")
    WEB_PORT = int(os.getenv("WEB_PORT", 5000))

    # БД
    DB_PATH = "db/tenderbot.db"
    # DATABASE_URL: на проде Supabase/Postgres,
    # локально пустой — используется SQLite по DB_PATH.
    DATABASE_URL = os.getenv("DATABASE_URL", "")

cfg = Config()
