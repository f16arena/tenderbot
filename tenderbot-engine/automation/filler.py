# Автозаполнение форм и подача заявок через Playwright
import asyncio
import time
from playwright.async_api import async_playwright
from loguru import logger
from config import cfg
from automation.ecp_signer import ECPSigner
from db.database import get_session
from db.models import Application
from datetime import datetime

class AutoFiller:
    """Автоматически заполняет и подаёт заявку на Goszakup."""

    async def submit_goszakup(self, lot_url: str, offer_price: float,
                               delivery_days: int, description: str) -> dict:
        start = time.time()
        result = {"success": False, "time": 0, "error": ""}

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=False)  # headless=True для фона
            context = await browser.new_context()
            page = await context.new_page()

            try:
                # 1. Авторизация
                logger.info("🔐 Авторизация на Goszakup...")
                await page.goto("https://goszakup.gov.kz/user/login", timeout=30000)
                await page.fill("#login", cfg.GOSZAKUP_LOGIN)
                await page.fill("#password", cfg.GOSZAKUP_PASSWORD)
                await page.click("button[type=submit]")
                await page.wait_for_url("**/cabinet/**", timeout=15000)
                logger.info("✅ Авторизован")

                # 2. Открыть лот
                await page.goto(lot_url, timeout=30000)
                await page.wait_for_selector("button.apply-btn, a.submit-application", timeout=10000)

                # 3. Нажать "Подать заявку"
                await page.click("button.apply-btn, a.submit-application")
                await page.wait_for_selector("form.application-form", timeout=10000)

                # 4. Заполнить поля
                await page.fill("input[name=price], input[name=offerPrice]",
                                str(offer_price))
                await page.fill("input[name=deliveryDays], input[name=delivery_period]",
                                str(delivery_days))
                if description:
                    await page.fill("textarea[name=description], textarea[name=techSpec]",
                                    description)

                # 5. Прикрепить документы (из папки docs/)
                file_input = await page.query_selector("input[type=file]")
                if file_input:
                    await file_input.set_input_files(["docs/ustav.pdf", "docs/licenziya.pdf"])

                # 6. Подписать ЭЦП
                logger.info("🔏 Подписание ЭЦП...")
                ecp = ECPSigner()
                # Получить XML для подписания со страницы
                xml_data = await page.evaluate("() => window.getSignXml ? window.getSignXml() : ''")
                if xml_data:
                    signed = ecp.sign_sync(xml_data)
                    if signed:
                        await page.evaluate(f"(xml) => window.setSignedXml(xml)", signed)

                # 7. Подтвердить подачу
                await page.click("button.confirm-submit, button[type=submit].final")
                await page.wait_for_selector(".success-message, .application-submitted", timeout=15000)

                elapsed = round(time.time() - start, 1)
                result = {"success": True, "time": elapsed}
                logger.info(f"✅ Заявка подана! Время: {elapsed} сек")

            except Exception as e:
                result["error"] = str(e)
                logger.error(f"❌ Ошибка автоподачи: {e}")
            finally:
                await browser.close()

        # Сохранить в БД
        if result["success"]:
            db = get_session()
            app = Application(
                lot_id      = lot_url.split("/")[-1],
                platform    = "GOZ",
                price       = offer_price,
                status      = "submitted",
                auto        = True,
                submit_time = result["time"],
                submitted_at = datetime.utcnow(),
            )
            db.add(app)
            db.commit()

        return result
