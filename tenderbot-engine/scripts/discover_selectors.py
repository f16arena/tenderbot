"""
Открывает публичный список лотов на каждой тендерной площадке РК через Playwright,
выгребает структуру DOM и сохраняет:
  - HTML страницы (logs/discovery/<platform>.html)
  - скриншот (logs/discovery/<platform>.png)
  - JSON-сводку с кандидатами в "карточку лота" (logs/discovery/<platform>.json)

На основании этого вручную пишутся CSS-селекторы в parsers/<платформа>.py.

Запуск:  ./venv/bin/python scripts/discover_selectors.py
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "logs" / "discovery"
OUT.mkdir(parents=True, exist_ok=True)

PLATFORMS = [
    # (код, URL списка лотов, описание)
    ("goszakup",    "https://goszakup.gov.kz/ru/announce/index/search",       "Goszakup — публичный поиск объявлений"),
    ("samruk",      "https://www.samruk-zakup.kz/lots/search",                "Самрук-Казына — поиск лотов"),
    ("etk",         "https://etk.kz/ru/lots",                                  "ЕТК"),
    ("etp",         "https://etp.kz/ru/trades",                                "ЭТП"),
    ("btk",         "https://btk.kz/",                                         "БТК — главная (нет публичного /lots)"),
    ("kazatomprom", "https://zakup.kazatomprom.kz/",                          "Казатомпром"),
]

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


async def discover_one(p, code: str, url: str, title: str) -> dict:
    print(f"\n━━━ {code:12} {title}")
    print(f"  URL: {url}")
    summary = {"code": code, "url": url, "status": "unknown", "candidates": []}
    browser = await p.chromium.launch(headless=True)
    ctx = await browser.new_context(user_agent=UA, viewport={"width": 1440, "height": 900},
                                    locale="ru-RU")
    page = await ctx.new_page()
    try:
        resp = await page.goto(url, timeout=30000, wait_until="domcontentloaded")
        summary["http_status"] = resp.status if resp else None
        try:
            await page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass

        summary["title"]   = await page.title()
        summary["final_url"] = page.url

        # сохраняем артефакты
        html = await page.content()
        (OUT / f"{code}.html").write_text(html, encoding="utf-8")
        await page.screenshot(path=str(OUT / f"{code}.png"), full_page=False)

        # эвристика: ищем повторяющиеся «карточные» структуры
        candidates_js = """
        () => {
          const groups = new Map();
          // классы, которые часто встречаются группами — потенциальные карточки
          const all = document.querySelectorAll('div, li, tr, article, section');
          all.forEach(el => {
            if (!el.className || typeof el.className !== 'string') return;
            el.className.split(/\\s+/).forEach(cls => {
              if (!cls || cls.length < 3) return;
              if (!groups.has(cls)) groups.set(cls, 0);
              groups.set(cls, groups.get(cls) + 1);
            });
          });
          // оставляем те, что встречаются 5-100 раз (типично для списка лотов на странице)
          const hot = [...groups.entries()]
            .filter(([c, n]) => n >= 5 && n <= 100)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 25);

          // для каждого — пример первого элемента
          return hot.map(([cls, n]) => {
            const el = document.querySelector('.' + cls.replace(/:/g, '\\\\:'));
            return {
              selector: '.' + cls,
              count: n,
              tag: el?.tagName?.toLowerCase(),
              text_sample: (el?.innerText || '').slice(0, 160).replace(/\\s+/g, ' ').trim(),
            };
          });
        }
        """
        cands = await page.evaluate(candidates_js)
        summary["candidates"] = cands
        summary["status"] = "ok"
        print(f"  ✓ HTTP {resp.status if resp else '?'}, заголовок: {summary['title'][:80]}")
        print(f"  ✓ Топ-кандидатов в карточку лота: {len(cands)}")
        for c in cands[:5]:
            print(f"     • {c['selector']:40} ×{c['count']:>3}  «{c['text_sample'][:80]}»")
    except Exception as e:
        summary["status"] = "error"
        summary["error"] = str(e)[:300]
        print(f"  ✗ Ошибка: {e}")
    finally:
        await ctx.close()
        await browser.close()
    (OUT / f"{code}.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary


async def main():
    async with async_playwright() as p:
        results = []
        for code, url, title in PLATFORMS:
            results.append(await discover_one(p, code, url, title))
    (OUT / "_summary.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n=== готово, артефакты в {OUT} ===")


if __name__ == "__main__":
    asyncio.run(main())
