# Deployment

## ⚠️ Про Vercel

**Vercel не подходит для этого проекта.** Это serverless-платформа: функции живут
10–60 сек, нет background workers, нет места под Playwright/Chromium.
У нас же — долгоживущий Flask-сервер + APScheduler-фон + (опц.) Telegram polling
+ Playwright (170+ МБ Chromium).

**Куда деплоить:** Railway (рекомендую) / Render / Fly.io / VPS.

---

## База данных — Supabase

1. Создать проект на https://supabase.com (free tier хватит на старт).
2. Project Settings → Database → Connection string → URI (с паролем).
3. Скопировать строку вида `postgresql://postgres:<pw>@db.<...>.supabase.co:5432/postgres`.
4. На Railway/Render/Fly прописать в Environment Variables:
   ```
   DATABASE_URL=postgresql://postgres:<pw>@db.<...>.supabase.co:5432/postgres
   ```
5. При первом старте `init_db()` автоматически создаст таблицы и засидит тарифы.

---

## Деплой на Railway

1. Зарегистрируйтесь на https://railway.app (вход через GitHub).
2. **New Project → Deploy from GitHub repo → выбрать репо `tenderbot`.**
3. Railway увидит `Dockerfile` и `railway.json` — соберёт автоматически.
4. **Variables (Environment Variables):** вставить все из `.env` (без `WEB_PORT` —
   Railway сам передаёт `PORT`):
   ```
   DATABASE_URL          = postgresql://... (из Supabase)
   GOSZAKUP_TOKEN        = ...
   TELEGRAM_BOT_TOKEN    = ...
   TELEGRAM_CHAT_ID      = ...
   ORG_NAME              = ТОО «Turanix»
   ORG_BIN               = 260540022744
   MIN_LOT_PRICE         = 1000000
   MAX_LOT_PRICE         = 500000000
   SCAN_INTERVAL_SECONDS = 30
   ```
5. Domain → Generate domain → получите `tenderbot-production.up.railway.app`.
6. Подключите свой домен `tenderbot.turanix.kz` (Settings → Domains → Custom).

**Цена:** ~$5/мес базовый план, плюс ~$5/мес за всегда-включённый сервис.
Можно дёшево начать.

---

## Деплой на Render (альтернатива)

1. https://render.com → New → Web Service → Connect GitHub.
2. Build Command: оставить пустым (используется Dockerfile).
3. Start Command: `python main.py`.
4. Environment Variables — те же, что для Railway.
5. **Disk:** добавить Persistent Disk если используете SQLite (для Supabase не нужно).

Free tier есть, но засыпает после 15 мин неактивности (плохо для мониторинга).
Платный — от $7/мес.

---

## Деплой на VPS (DigitalOcean / Hetzner)

1. Создать VM Ubuntu 22.04 (минимально 1 GB RAM).
2. `ssh root@<ip>`, поставить Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. Склонировать репо, прописать `.env`:
   ```bash
   git clone https://github.com/<user>/tenderbot.git
   cd tenderbot
   cp .env.example .env && nano .env
   docker build -t tenderbot .
   docker run -d --name tenderbot --restart unless-stopped \
     --env-file .env -p 80:8080 tenderbot
   ```
4. Поставить Nginx + Let's Encrypt для HTTPS (или Caddy для простоты).

**Цена:** $4–6/мес Hetzner CX11, $6/мес DigitalOcean Basic Droplet.

---

## Чек-лист перед production

- [ ] `DATABASE_URL` указывает на Supabase Postgres (не SQLite)
- [ ] `.env` НЕ в репозитории (проверьте `.gitignore`)
- [ ] `Flask secret_key` стабильный (генерируется в `.flask_secret`, попадает в volume контейнера)
- [ ] `TELEGRAM_BOT_TOKEN` валидный
- [ ] `GOSZAKUP_TOKEN` получен от ЦЭФ
- [ ] HTTPS включён (Railway/Render даёт сам; на VPS — через Caddy/Certbot)
- [ ] Свой домен подключён
- [ ] Backup БД настроен (Supabase делает daily-снапшоты автоматически на free)
- [ ] Логирование — отдельный сервис (Better Stack / Logtail / Papertrail), а не в файл

---

## Playwright/agent-browser в проде

**Не запускайте в одном процессе с Flask** — слишком тяжело. Варианты:

1. **Вынести парсеры в отдельный сервис** на Railway (другой деплой того же репо,
   но с `CMD ["python", "scheduler/standalone_monitor.py"]` или флагом).
2. **Использовать BrowserCat / Browserless / Bright Data** — облачные браузеры
   по API (~$30/мес за достаточный объём).
3. **Скрапить через requests + BeautifulSoup** где можно (там где сайт не SPA).
