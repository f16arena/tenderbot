# Парсер Самрук-Казына через Playwright (headless браузер)
# Сайт: samruk-zakup.kz

import asyncio
from playwright.async_api import async_playwright
from loguru import logger
from db.models import Lot
from config import cfg
from datetime import datetime
import re

class SamrukParser:
    BASE_URL = "https://www.samruk-zakup.kz"
    LOTS_URL = "https://www.samruk-zakup.kz/lots/search"

    async def fetch_lots(self, pages=2):
        lots = []
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124"
            )
            page = await context.new_page()

            try:
                await page.goto(self.LOTS_URL, timeout=30000)
                await page.wait_for_selector(".lot-card, .tender-item", timeout=15000)

                for pg in range(pages):
                    items = await page.query_selector_all(".lot-card, .tender-item")
                    for item in items:
                        try:
                            lot = await self._parse_item(item, page)
                            if lot:
                                lots.append(lot)
                        except Exception as e:
                            logger.warning(f"Самрук — ошибка элемента: {e}")

                    # Следующая страница
                    next_btn = await page.query_selector("a.next, button.next-page")
                    if next_btn:
                        await next_btn.click()
                        await page.wait_for_timeout(2000)
                    else:
                        break

            except Exception as e:
                logger.error(f"❌ Самрук парсер: {e}")
            finally:
                await browser.close()

        logger.info(f"✅ Самрук: найдено {len(lots)} лотов")
        return lots

    async def _parse_item(self, item, page):
        title_el = await item.query_selector(".lot-name, h3, .title")
        price_el = await item.query_selector(".lot-price, .price, .sum")
        id_el    = await item.query_selector(".lot-number, .id")
        date_el  = await item.query_selector(".deadline, .end-date")
        link_el  = await item.query_selector("a")

        title = await title_el.inner_text() if title_el else ""
        price_raw = await price_el.inner_text() if price_el else "0"
        lot_id_raw = await id_el.inner_text() if id_el else ""
        link = await link_el.get_attribute("href") if link_el else ""

        # Очистить цену
        price = float(re.sub(r"[^\d.]", "", price_raw.replace(",", ".")) or 0)

        return Lot(
            lot_id   = f"SK-{lot_id_raw.strip()}",
            platform = "SAM",
            title    = title.strip(),
            price    = price,
            url      = self.BASE_URL + link if link.startswith("/") else link,
            category = self._detect_category(title),
            status   = "new",
        )

    def _detect_category(self, title):
        t = title.lower()
        if "ремонт" in t: return "ремонт"
        if any(w in t for w in ["строительство","монтаж"]): return "строительство"
        if any(w in t for w in ["поставка","приобретение"]): return "поставка"
        return "услуги"
