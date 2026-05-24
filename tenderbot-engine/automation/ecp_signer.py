# Автоподписание через NCA Layer
# NCA Layer должен быть запущен локально (устанавливается с сайта pki.gov.kz)
# WebSocket: ws://127.0.0.1:13579

from __future__ import annotations

import asyncio
import json
import websockets
from loguru import logger
from config import cfg

NCA_WS = "ws://127.0.0.1:13579/"

class ECPSigner:
    """
    Подписывает XML/данные через NCA Layer (НУЦ РК).
    NCA Layer должен быть запущен на компьютере.
    """

    async def sign(self, xml_data: str) -> str | None:
        """Подписать данные. Возвращает подписанный XML или None при ошибке."""
        try:
            async with websockets.connect(NCA_WS, ping_interval=None) as ws:
                # 1. Проверить версию
                await ws.send(json.dumps({"version": "1.0"}))
                resp = json.loads(await ws.recv())
                logger.debug(f"NCA Layer версия: {resp}")

                # 2. Открыть хранилище ключей
                await ws.send(json.dumps({
                    "method":   "browseKeyStore",
                    "args":     [cfg.ECP_PATH, "PKCS12", cfg.ECP_PASSWORD],
                    "version":  "1.0",
                }))
                resp = json.loads(await ws.recv())
                if resp.get("result") != "ok":
                    logger.error(f"ЭЦП: ошибка открытия хранилища: {resp}")
                    return None

                # 3. Подписать данные
                await ws.send(json.dumps({
                    "method":  "signXml",
                    "args":    [xml_data],
                    "version": "1.0",
                }))
                resp = json.loads(await ws.recv())

                if resp.get("result") == "ok":
                    logger.info("✅ ЭЦП: документ подписан")
                    return resp.get("responseObject")
                else:
                    logger.error(f"ЭЦП: ошибка подписания: {resp}")
                    return None

        except ConnectionRefusedError:
            logger.error("❌ NCA Layer не запущен! Запустите программу NCA Layer.")
            return None
        except Exception as e:
            logger.error(f"❌ ЭЦП ошибка: {e}")
            return None

    def sign_sync(self, xml_data: str) -> str | None:
        """Синхронная обёртка для использования вне async."""
        return asyncio.run(self.sign(xml_data))
