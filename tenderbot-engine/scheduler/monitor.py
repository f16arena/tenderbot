import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from loguru import logger
from api.goszakup import GoszakupAPI
from parsers.samruk import SamrukParser
from db.database import get_session
from db.models import Lot
from config import cfg

class Monitor:
    def __init__(self, tg_bot=None):
        self.scheduler = AsyncIOScheduler()
        self.tg_bot = tg_bot
        self.goz_api = GoszakupAPI()
        self.samruk  = SamrukParser()

    def start(self):
        # Goszakup — каждые N секунд
        self.scheduler.add_job(
            self._scan_goszakup,
            "interval",
            seconds=cfg.SCAN_INTERVAL,
            id="goszakup"
        )
        # Самрук — каждые 2 минуты (сайт медленнее)
        self.scheduler.add_job(
            self._scan_samruk,
            "interval",
            seconds=120,
            id="samruk"
        )
        self.scheduler.start()
        logger.info(f"✅ Мониторинг запущен (интервал: {cfg.SCAN_INTERVAL} сек)")

    async def _scan_goszakup(self):
        logger.info("🔍 Сканирование Goszakup...")
        lots = self.goz_api.fetch_lots(limit=50)
        await self._save_and_notify(lots)

    async def _scan_samruk(self):
        logger.info("🔍 Сканирование Самрук-Казына...")
        lots = await self.samruk.fetch_lots(pages=2)
        await self._save_and_notify(lots)

    async def _save_and_notify(self, lots):
        db = get_session()
        new_count = 0
        for lot in lots:
            # Фильтр по цене
            if lot.price < cfg.MIN_PRICE or lot.price > cfg.MAX_PRICE:
                continue
            # Фильтр по ключевым словам
            if cfg.KEYWORDS and not any(
                k.strip().lower() in lot.title.lower() for k in cfg.KEYWORDS if k.strip()
            ):
                continue
            # Проверить — не было ли раньше
            exists = db.query(Lot).filter_by(lot_id=lot.lot_id).first()
            if not exists:
                db.add(lot)
                db.commit()
                new_count += 1
                # Уведомить в Telegram
                if self.tg_bot:
                    await self.tg_bot.notify_new_lot(lot)
        if new_count:
            logger.info(f"💾 Сохранено {new_count} новых лотов")
