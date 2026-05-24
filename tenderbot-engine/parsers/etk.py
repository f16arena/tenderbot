# Парсер ЕТК (etk.kz) — наследует BaseParser.
# ⚠️ CSS-селекторы ориентировочные: проверьте/уточните на живом сайте.
from parsers.base import BaseParser


class ETKParser(BaseParser):
    PLATFORM = "ETK"
    PREFIX = "ETK-"
    BASE_URL = "https://etk.kz"
    LOTS_URL = "https://etk.kz/ru/lots"

    SELECTORS = {
        "card":  ".lot-card, .tender-item, tr.lot-row",
        "title": ".lot-name, h3, .title, td.name",
        "price": ".lot-price, .price, .sum, td.price",
        "id":    ".lot-number, .id, td.number",
        "date":  ".deadline, .end-date, td.deadline",
        "link":  "a",
        "next":  "a.next, button.next-page, li.next a",
    }
