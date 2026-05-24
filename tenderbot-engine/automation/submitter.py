# Высокоуровневая обёртка над автоподачей заявок.
# Берёт лот из БД, копирует документы из прошлых заявок, запускает AutoFiller,
# обновляет статусы и уведомляет в Telegram.

from __future__ import annotations

from loguru import logger
from datetime import datetime

from db.database import get_session
from db.models import Lot, Application, Document
from automation.filler import AutoFiller
from automation.ai_filler import AIFiller, AgentBrowserNotInstalled


class Submitter:
    """Координирует подачу заявки: подготовка → автозаполнение → запись результата."""

    def __init__(self, tg_bot=None):
        self.filler = AutoFiller()
        self.tg_bot = tg_bot

    def _markup(self, base_price: float) -> float:
        """Простая стратегия цены: предложить на 5% ниже стартовой."""
        return round(base_price * 0.95, 2) if base_price else 0.0

    def reusable_documents(self) -> list[str]:
        """Пути к документам из прошлых заявок (для прикрепления к новой)."""
        db = get_session()
        docs = db.query(Document).order_by(Document.used_count.desc()).all()
        paths = []
        now = datetime.utcnow()
        for d in docs:
            if d.expires_at and d.expires_at < now:
                continue  # просроченный документ — пропускаем
            if d.file_path:
                paths.append(d.file_path)
        return paths

    async def submit_lot(self, lot_id: str, offer_price: float | None = None,
                          delivery_days: int = 30, description: str = "",
                          mode: str = "playwright") -> dict:
        """
        Подать заявку на лот по его lot_id.

        mode:
          - "playwright" (по умолчанию) — детерминированная подача через Playwright (filler.py).
          - "ai"                        — подача через agent-browser (ai_filler.py).
                                          Устойчивее к смене вёрстки, но медленнее.
        """
        db = get_session()
        lot = db.query(Lot).filter_by(lot_id=lot_id).first()
        if not lot:
            logger.error(f"Лот {lot_id} не найден в БД")
            return {"success": False, "error": "lot_not_found"}

        price = offer_price if offer_price is not None else self._markup(lot.price)

        # Черновик заявки
        app = Application(
            lot_id=lot.lot_id,
            platform=lot.platform,
            title=lot.title,
            price=price,
            status="draft",
            auto=True,
            created_at=datetime.utcnow(),
        )
        db.add(app)
        db.commit()

        logger.info(f"⚡ Подача заявки на {lot_id} по цене {price:,.0f} ₸ (mode={mode})")

        # Сейчас автоподача реализована для Goszakup; остальные площадки — по аналогии.
        if lot.platform == "GOZ":
            if mode == "ai":
                try:
                    ai = AIFiller()
                    # synchronous CLI call — выполняем в потоке, чтобы не блокировать event loop
                    import asyncio
                    result = await asyncio.to_thread(
                        ai.submit_via_steps,
                        lot.url, price, delivery_days, description,
                    )
                except AgentBrowserNotInstalled as e:
                    result = {"success": False, "error": str(e)}
            else:
                result = await self.filler.submit_goszakup(
                    lot_url=lot.url,
                    offer_price=price,
                    delivery_days=delivery_days,
                    description=description,
                )
        else:
            result = {"success": False, "error": f"автоподача для {lot.platform} не настроена"}

        # Обновить статусы
        if result.get("success"):
            app.status = "submitted"
            app.submit_time = result.get("time", 0)
            app.submitted_at = datetime.utcnow()
            lot.status = "applied"
        else:
            app.status = "draft"
        db.commit()

        # Увеличить счётчик использования документов
        for d in db.query(Document).all():
            if d.file_path in self.reusable_documents():
                d.used_count += 1
        db.commit()

        return result

    def submit_lot_sync(self, lot_id: str, **kwargs) -> dict:
        import asyncio
        return asyncio.run(self.submit_lot(lot_id, **kwargs))
