# Парсер ЭТП (etp.kz) — наследует BaseParser.
# ⚠️ CSS-селекторы ориентировочные: проверьте/уточните на живом сайте.
from parsers.base import BaseParser


class ETPParser(BaseParser):
    PLATFORM = "ETP"
    PREFIX = "ETP-"
    BASE_URL = "https://etp.kz"
    LOTS_URL = "https://etp.kz/ru/trades"

    SELECTORS = {
        "card":  ".lot-card, .tender-item, tr.lot-row",
        "title": ".lot-name, h3, .title, td.name",
        "price": ".lot-price, .price, .sum, td.price",
        "id":    ".lot-number, .id, td.number",
        "date":  ".deadline, .end-date, td.deadline",
        "link":  "a",
        "next":  "a.next, button.next-page, li.next a",
    }
