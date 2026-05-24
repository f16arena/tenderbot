# Парсер БТК (btk.kz) — наследует BaseParser.
# ⚠️ CSS-селекторы ориентировочные: проверьте/уточните на живом сайте.
from parsers.base import BaseParser


class BTKParser(BaseParser):
    PLATFORM = "BTK"
    PREFIX = "BTK-"
    BASE_URL = "https://btk.kz"
    LOTS_URL = "https://btk.kz/ru/lots"

    SELECTORS = {
        "card":  ".lot-card, .tender-item, tr.lot-row",
        "title": ".lot-name, h3, .title, td.name",
        "price": ".lot-price, .price, .sum, td.price",
        "id":    ".lot-number, .id, td.number",
        "date":  ".deadline, .end-date, td.deadline",
        "link":  "a",
        "next":  "a.next, button.next-page, li.next a",
    }
