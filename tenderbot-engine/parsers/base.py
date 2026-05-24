# Базовый класс для всех парсеров тендерных площадок (Playwright)
import re
from playwright.async_api import async_playwright
from loguru import logger
from db.models import Lot


class BaseParser:
    """
    Базовый парсер площадки. Наследники переопределяют:
      - PLATFORM   : короткий код площадки ("ETK", "ETP", ...)
      - PREFIX     : префикс lot_id ("ETK-")
      - BASE_URL   : корень сайта
      - LOTS_URL   : страница со списком лотов
      - SELECTORS  : CSS-селекторы карточки и полей
    """

    PLATFORM = "BASE"
    PREFIX = "XX-"
    BASE_URL = ""
    LOTS_URL = ""
    USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124"

    # Селекторы по умолчанию — переопределяй под конкретный сайт
    SELECTORS = {
        "card":  ".lot-card, .tender-item, tr.lot-row",
        "title": ".lot-name, h3, .title, td.name",
        "price": ".lot-price, .price, .sum, td.price",
        "id":    ".lot-number, .id, td.number",
        "date":  ".deadline, .end-date, td.deadline",
        "link":  "a",
        "next":  "a.next, button.next-page, li.next a",
    }

    async def fetch_lots(self, pages: int = 2):
        """Открыть площадку и собрать лоты со страниц списка."""
        lots = []
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent=self.USER_AGENT)
            page = await context.new_page()
            try:
                await page.goto(self.LOTS_URL, timeout=30000)
                await page.wait_for_selector(self.SELECTORS["card"], timeout=15000)

                for _ in range(pages):
                    items = await page.query_selector_all(self.SELECTORS["card"])
                    for item in items:
                        try:
                            lot = await self._parse_item(item)
                            if lot:
                                lots.append(lot)
                        except Exception as e:
                            logger.warning(f"{self.PLATFORM} — ошибка элемента: {e}")

                    next_btn = await page.query_selector(self.SELECTORS["next"])
                    if next_btn:
                        await next_btn.click()
                        await page.wait_for_timeout(2000)
                    else:
                        break
            except Exception as e:
                logger.error(f"❌ {self.PLATFORM} парсер: {e}")
            finally:
                await browser.close()

        logger.info(f"✅ {self.PLATFORM}: найдено {len(lots)} лотов")
        return lots

    async def _parse_item(self, item):
        sel = self.SELECTORS
        title_el = await item.query_selector(sel["title"])
        price_el = await item.query_selector(sel["price"])
        id_el    = await item.query_selector(sel["id"])
        link_el  = await item.query_selector(sel["link"])

        title      = (await title_el.inner_text()).strip() if title_el else ""
        price_raw  = (await price_el.inner_text()) if price_el else "0"
        lot_id_raw = (await id_el.inner_text()).strip() if id_el else ""
        link       = (await link_el.get_attribute("href")) if link_el else ""

        price = self.clean_price(price_raw)
        url = self.BASE_URL + link if link and link.startswith("/") else (link or self.LOTS_URL)

        if not title:
            return None

        return Lot(
            lot_id   = f"{self.PREFIX}{lot_id_raw or abs(hash(title)) % 10**8}",
            platform = self.PLATFORM,
            title    = title,
            price    = price,
            url      = url,
            category = self.detect_category(title),
            status   = "new",
        )

    @staticmethod
    def clean_price(raw: str) -> float:
        try:
            return float(re.sub(r"[^\d.]", "", str(raw).replace(",", ".")) or 0)
        except ValueError:
            return 0.0

    @staticmethod
    def detect_category(title: str) -> str:
        t = title.lower()
        if "ремонт" in t:
            return "ремонт"
        if any(w in t for w in ["строительство", "строит", "монтаж", "возведение"]):
            return "строительство"
        if any(w in t for w in ["поставка", "приобретение", "закупка товаров"]):
            return "поставка"
        if any(w in t for w in ["it", "программ", "разработк", "сайт", "система"]):
            return "ит"
        if any(w in t for w in ["проектирование", "проект", "изыскание"]):
            return "проектирование"
        return "услуги"
