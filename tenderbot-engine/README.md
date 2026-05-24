# TenderBot PRO

Локальная система автоматизации тендеров Казахстана:

- 🔍 Мониторит площадки (Goszakup API + парсеры Самрук, ЕТК, ЭТП, БТК, Казатомпром)
- 🔔 Уведомляет в Telegram о новых лотах по фильтрам
- ⚡ Автоматически заполняет и подаёт заявки (Playwright)
- 🔏 Подписывает ЭЦП через NCA Layer
- 📊 Показывает всё в веб-дашборде (Flask + SPA)

## Установка

```bash
cd tenderbot

# Виртуальное окружение
python3 -m venv venv
source venv/bin/activate          # Linux/Mac
# venv\Scripts\activate           # Windows

# Зависимости
pip install -r requirements.txt

# Браузер для Playwright
playwright install chromium

# Секреты
cp .env.example .env              # затем заполнить своими данными

# Запуск
python main.py
```

После запуска:
- 🌐 Дашборд: http://localhost:5000
- 📱 Telegram-бот активен (команды: /start, /lots, /stats, /status)

## Структура

```
tenderbot/
├── main.py              # Точка входа (БД + веб + бот + мониторинг)
├── config.py            # Конфиг из .env
├── api/goszakup.py      # GraphQL клиент Goszakup
├── parsers/             # base.py + samruk, etk, etp, btk, kazatomprom
├── automation/          # filler (автозаполнение), submitter, ecp_signer
├── bot/telegram_bot.py  # Telegram-бот
├── scheduler/monitor.py # APScheduler — периодический скан
├── db/                  # SQLAlchemy модели + SQLite
├── web/                 # Flask app + routes + static/index.html (дашборд)
└── docs/                # PDF/DOCX для прикрепления к заявкам
```

## Что работает сразу / что настроить

| Модуль | Сразу | Нужна настройка |
|--------|-------|-----------------|
| Дашборд (веб) | ✅ | открыть localhost:5000 |
| Мониторинг Goszakup | ✅ | токен API |
| Telegram-уведомления | ✅ | токен + chat_id |
| Парсеры площадок | ⚠️ | уточнить CSS-селекторы на живых сайтах |
| Автоподача | ⚠️ | логин/пароль + CSS-селекторы форм |
| ЭЦП | ⚠️ | установить NCA Layer, путь к .p12 |

## Получение токенов

- **Goszakup**: https://api.goszakup.gov.kz/ → регистрация разработчика → Bearer-токен
- **Telegram**: @BotFather → /newbot → токен; chat_id — через @getmyid_bot
- **ЭЦП (NCA Layer)**: https://pki.gov.kz/ncalayer/ — установить и запустить локально

> 💡 Для работы 24/7 запускайте на Linux VPS.

## AI-режим автоподачи (опционально)

Помимо детерминированной подачи через Playwright (`automation/filler.py`) проект
поддерживает подачу через [`agent-browser`](https://github.com/vercel-labs/agent-browser) —
CLI на Rust, который понимает страницу через accessibility-дерево. Полезно, когда
вёрстка формы непредсказуема: вместо хрупких CSS-селекторов используются
семантические локаторы (`label "Цена"`, `role "button" name "Подтвердить"`).

### Установка (изолированно в проект)
```bash
cd tenderbot
mkdir -p tools && cd tools
# Скачать portable Node 24 (≈25 МБ)
curl -sL -o node.tar.xz https://nodejs.org/dist/v24.0.0/node-v24.0.0-darwin-arm64.tar.xz
tar -xJf node.tar.xz && mv node-v24.0.0-darwin-arm64 node && rm node.tar.xz
cd ..
# Поставить agent-browser в tools/node
./tools/node/bin/npm install -g agent-browser --prefix tools/node
# Скачать Chrome for Testing (~170 МБ)
./tools/node/bin/agent-browser install
```

### Использование
- В дашборде на каждой карточке лота — кнопка **🤖 AI**.
- Из API: `POST /api/submit  {"lot_id":"GZ-88451","mode":"ai"}`.
- Статус доступности: `GET /api/ai/status`.
- Программно: `Submitter().submit_lot(lot_id, mode="ai")`.

> ⚠️ `agent-browser chat "..."` (полностью AI-режим) требует настроенного
> провайдера AI у agent-browser — см. его документацию. Метод
> `AIFiller.submit_via_steps()` работает без AI-провайдера, только через
> семантические локаторы.
