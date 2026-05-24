# Публичный GraphQL API Goszakup
# Документация: https://api.goszakup.gov.kz/

import httpx
from loguru import logger
from config import cfg
from db.database import get_session
from db.models import Lot
from datetime import datetime

GQL_URL = "https://ows.goszakup.gov.kz/v3/graphql"

QUERY_LOTS = """
query GetAnnouncements($filter: AnnouncementFilter, $limit: Int) {
  Announcements(filter: $filter, limit: $limit) {
    id
    nameRu
    totalSum
    trdBuyTypeId
    publishDate
    endDate
    lots {
      id
      nameRu
      amount
      count
    }
  }
}
"""

class GoszakupAPI:
    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {cfg.GOSZAKUP_TOKEN}",
            "Content-Type": "application/json",
        }

    def fetch_lots(self, limit=50):
        """Получить новые лоты с Goszakup через GraphQL"""
        try:
            resp = httpx.post(
                GQL_URL,
                json={"query": QUERY_LOTS, "variables": {"limit": limit}},
                headers=self.headers,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            announcements = data.get("data", {}).get("Announcements", [])
            logger.info(f"✅ Goszakup: получено {len(announcements)} объявлений")
            return self._parse(announcements)
        except Exception as e:
            logger.error(f"❌ Goszakup API ошибка: {e}")
            return []

    def _parse(self, items):
        lots = []
        for item in items:
            try:
                lot = Lot(
                    lot_id   = f"GZ-{item['id']}",
                    platform = "GOZ",
                    title    = item.get("nameRu", ""),
                    price    = float(item.get("totalSum", 0)),
                    deadline = datetime.fromisoformat(item["endDate"]) if item.get("endDate") else None,
                    url      = f"https://goszakup.gov.kz/ru/announcement/index/{item['id']}",
                    category = self._detect_category(item.get("nameRu", "")),
                    status   = "new",
                )
                lots.append(lot)
            except Exception as e:
                logger.warning(f"Ошибка парсинга лота: {e}")
        return lots

    def _detect_category(self, title: str) -> str:
        title = title.lower()
        if any(w in title for w in ["ремонт", "техобслуживание", "техническое обслуживание"]):
            return "ремонт"
        if any(w in title for w in ["строительство", "строит", "монтаж", "возведение"]):
            return "строительство"
        if any(w in title for w in ["поставка", "приобретение", "закупка товаров"]):
            return "поставка"
        if any(w in title for w in ["it", "программ", "разработк", "сайт", "система"]):
            return "ит"
        if any(w in title for w in ["проектирование", "проект", "изыскание"]):
            return "проектирование"
        return "услуги"
