# AI-режим автоподачи: тонкая обёртка над CLI `agent-browser` (Vercel Labs).
# Используется как опциональная альтернатива automation/filler.py, когда CSS-селекторы
# формы непредсказуемы. agent-browser сам понимает страницу через accessibility-дерево
# и AI-режим chat. Если бинарника нет — модуль возвращает осмысленную ошибку.

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

from loguru import logger

from config import cfg
from db.database import get_session
from db.models import Application
from datetime import datetime


PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOCAL_BIN = PROJECT_ROOT / "tools" / "node" / "bin" / "agent-browser"
LOCAL_NODE_BIN = PROJECT_ROOT / "tools" / "node" / "bin"


def find_agent_browser() -> str | None:
    """Ищет бинарник agent-browser: сначала локальный (tools/node/bin), потом PATH."""
    if LOCAL_BIN.exists():
        return str(LOCAL_BIN)
    found = shutil.which("agent-browser")
    return found


def _env_for_node() -> dict:
    """Готовит окружение так, чтобы вложенный `agent-browser.js` нашёл node в PATH."""
    env = os.environ.copy()
    if LOCAL_NODE_BIN.exists():
        env["PATH"] = f"{LOCAL_NODE_BIN}:{env.get('PATH', '')}"
    return env


class AgentBrowserNotInstalled(RuntimeError):
    pass


class AIFiller:
    """
    Высокоуровневая автоподача через agent-browser.

    Два режима:
      1. submit_via_steps(...) — детерминированный сценарий командами CLI
         (open / fill / click / screenshot). Не требует AI-провайдера.
      2. submit_via_chat(...) — естественно-языковая инструкция через `agent-browser chat`.
         Требует настроенного провайдера AI в agent-browser (см. README).
    """

    def __init__(self, binary: str | None = None, timeout: int = 120):
        self.binary = binary or find_agent_browser()
        self.timeout = timeout
        if not self.binary:
            logger.warning(
                "⚠️ agent-browser не найден. Установите: "
                "tools/node/bin/npm install -g agent-browser --prefix tools/node "
                "и `agent-browser install`."
            )

    # ── низкоуровневая обёртка ────────────────────────────────────────────
    def _run(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        if not self.binary:
            raise AgentBrowserNotInstalled("agent-browser CLI не установлен")
        cmd = [self.binary, *args]
        logger.debug(f"agent-browser: {' '.join(cmd[1:])}")
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=self.timeout,
            env=_env_for_node(),
            check=check,
        )

    def open(self, url: str) -> str:
        return self._run("open", url).stdout

    def fill(self, selector: str, value: str) -> str:
        return self._run("fill", selector, value).stdout

    def click(self, selector: str) -> str:
        return self._run("click", selector).stdout

    def snapshot(self) -> str:
        return self._run("snapshot").stdout

    def screenshot(self, path: str | None = None, full: bool = False) -> str:
        args = ["screenshot"]
        if full:
            args.append("--full")
        if path:
            args.append(path)
        return self._run(*args).stdout.strip()

    def close(self):
        try:
            self._run("close", "--all", check=False)
        except Exception:
            pass

    # ── сценарии ──────────────────────────────────────────────────────────
    def submit_via_steps(
        self,
        lot_url: str,
        offer_price: float,
        delivery_days: int = 30,
        description: str = "",
        login_url: str = "https://goszakup.gov.kz/user/login",
    ) -> dict:
        """
        Детерминированный сценарий: login → открыть лот → заполнить форму → submit.
        Использует семантические локаторы agent-browser (`find role`, `find label`),
        которые устойчивее, чем хрупкие CSS-селекторы.
        """
        start = time.time()
        result = {"success": False, "time": 0.0, "error": "", "screenshot": None}

        try:
            # 1) Логин
            logger.info("🔐 [AI] Открываю страницу логина Goszakup…")
            self.open(login_url)
            # `find label` подставит логин в поле с подписью «Логин» / «Login»
            self._run("find", "label", "Логин", "fill", cfg.GOSZAKUP_LOGIN, check=False)
            self._run("find", "label", "Пароль", "fill", cfg.GOSZAKUP_PASSWORD, check=False)
            self._run("find", "role", "button", "click", "--name", "Войти", check=False)
            self._run("wait", "--url", "**/cabinet/**", check=False)

            # 2) Открыть лот
            logger.info(f"📋 [AI] Открываю лот {lot_url}")
            self.open(lot_url)
            self._run("find", "text", "Подать заявку", "click", check=False)

            # 3) Заполнить поля
            self._run("find", "label", "Цена", "fill", str(offer_price), check=False)
            self._run("find", "label", "Срок", "fill", str(delivery_days), check=False)
            if description:
                self._run("find", "label", "Описание", "fill", description, check=False)

            # 4) Скриншот перед подачей (для аудита)
            screenshot_path = str(PROJECT_ROOT / "logs" / f"ai_submit_{int(start)}.png")
            try:
                self.screenshot(screenshot_path, full=True)
                result["screenshot"] = screenshot_path
            except Exception as e:
                logger.warning(f"скриншот не сохранён: {e}")

            # 5) Подтвердить
            self._run("find", "role", "button", "click", "--name", "Подтвердить", check=False)
            self._run("wait", "--text", "Заявка подана", check=False)

            result["success"] = True
        except subprocess.TimeoutExpired:
            result["error"] = "таймаут agent-browser"
        except Exception as e:
            result["error"] = str(e)
        finally:
            self.close()
            result["time"] = round(time.time() - start, 1)

        # Запись в БД
        if result["success"]:
            db = get_session()
            app = Application(
                lot_id=lot_url.split("/")[-1],
                platform="GOZ",
                price=offer_price,
                status="submitted",
                auto=True,
                submit_time=result["time"],
                submitted_at=datetime.utcnow(),
            )
            db.add(app)
            db.commit()
            logger.info(f"✅ [AI] Заявка подана за {result['time']} сек")
        else:
            logger.error(f"❌ [AI] Не удалось подать: {result['error']}")

        return result

    def submit_via_chat(self, instruction: str) -> dict:
        """
        Полностью AI-режим. Отдаёт инструкцию `agent-browser chat`. Требует
        настроенного AI-провайдера у agent-browser (см. README, раздел chat).
        """
        start = time.time()
        try:
            out = self._run("chat", instruction, check=False)
            success = out.returncode == 0
            return {
                "success": success,
                "time": round(time.time() - start, 1),
                "output": out.stdout[-2000:],
                "error": out.stderr[-500:] if not success else "",
            }
        except Exception as e:
            return {"success": False, "time": round(time.time() - start, 1), "error": str(e)}


def diagnose() -> dict:
    """Сводка о доступности agent-browser — для дашборда."""
    binary = find_agent_browser()
    info = {"available": bool(binary), "binary": binary, "version": None}
    if binary:
        try:
            out = subprocess.run(
                [binary, "--version"],
                capture_output=True, text=True, timeout=10,
                env=_env_for_node(),
            )
            info["version"] = out.stdout.strip() or out.stderr.strip()
        except Exception as e:
            info["error"] = str(e)
    return info
