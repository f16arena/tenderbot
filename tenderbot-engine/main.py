import asyncio
import threading
from loguru import logger
from config import cfg
from db.database import init_db
from scheduler.monitor import Monitor
from bot.telegram_bot import TenderBot
from web.app import create_app

logger.add("logs/tenderbot.log", rotation="10 MB", retention="7 days", level="INFO")

def run_web(app):
    """Запустить Flask в отдельном потоке."""
    logger.info(f"🌐 Веб-дашборд: http://localhost:{cfg.WEB_PORT}")
    app.run(host=cfg.WEB_HOST, port=cfg.WEB_PORT, debug=False, use_reloader=False)

async def main():
    logger.info("🚀 TenderBot PRO запускается...")

    # 1. Инициализировать БД
    init_db()

    # 2. Создать Flask-приложение
    flask_app = create_app()
    web_thread = threading.Thread(target=run_web, args=(flask_app,), daemon=True)
    web_thread.start()

    # 3. Telegram-бот (опционально — только при заданном токене)
    tg_bot = None
    if cfg.TG_TOKEN and cfg.TG_TOKEN != "1234567890:AABBccdd...":
        try:
            tg_bot = TenderBot()
        except Exception as e:
            logger.warning(f"⚠️ Telegram-бот не инициализирован: {e}")
            tg_bot = None
    else:
        logger.warning("⚠️ TELEGRAM_BOT_TOKEN не задан — бот отключён, дашборд и мониторинг работают.")

    # 4. Запустить мониторинг
    monitor = Monitor(tg_bot=tg_bot)
    monitor.start()

    logger.info("✅ Всё запущено!")
    logger.info(f"🌐 Дашборд: http://localhost:{cfg.WEB_PORT}")

    # 5. Запустить Telegram polling (если бот настроен)
    if tg_bot:
        try:
            await tg_bot.app.initialize()
            await tg_bot.app.start()
            await tg_bot.app.updater.start_polling()
            logger.info("📱 Telegram-бот активен")
        except Exception as e:
            logger.error(f"❌ Telegram-бот не запущен (проверьте токен): {e}")
            tg_bot = None

    # Держать запущенным
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, SystemExit):
        logger.info("🛑 Остановка...")
        if tg_bot:
            await tg_bot.app.updater.stop()
            await tg_bot.app.stop()
        monitor.scheduler.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
