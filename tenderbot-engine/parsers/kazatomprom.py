# Парсер Казатомпром (zakup.kazatomprom.kz) — наследует BaseParser.
# ⚠️ CSS-селекторы ориентировочные: проверьте/уточните на живом сайте.
from parsers.base import BaseParser


class KazatompromParser(BaseParser):
    PLATFORM = "KAP"
    PREFIX = "KAP-"
    BASE_URL = "https://zakup.kazatomprom.kz"
    LOTS_URL = "https://zakup.kazatomprom.kz/ru/lots"

    SELECTORS = {
        "card":  ".lot-card, .tender-item, tr.lot-row",
        "title": ".lot-name, h3, .title, td.name",
        "price": ".lot-price, .price, .sum, td.price",
        "id":    ".lot-number, .id, td.number",
        "date":  ".deadline, .end-date, td.deadline",
        "link":  "a",
        "next":  "a.next, button.next-page, li.next a",
    }
