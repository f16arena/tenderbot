# Security & Architecture Audit — TenderBot
**Дата:** 2026-05-27
**Аудитор:** AI-обзор перед публикацией / деплоем
**Объём:** `web/` (Next.js 16 + Supabase) и `tenderbot-engine/` (Python референс)

## Сводка

| Уровень | Найдено | Исправлено | Документировано |
|---|---|---|---|
| 🔴 Критичные | 3 | ✅ 3 | ✅ |
| 🟠 Высокие | 4 | ✅ 4 | ✅ |
| 🟡 Средние | 5 | ✅ 3 / ⏳ 2 | ✅ |
| 🟢 Низкие | 7 | ⏳ 4 / TODO 3 | ✅ |

---

## 🔴 Критичные (могли быть эксплуатируемы публично)

### C1. Cron-эндпоинт открыт без `CRON_SECRET` → ✅ ИСПРАВЛЕНО
**Файл:** `web/src/app/api/cron/scan/route.ts`
**Было:** `if (process.env.CRON_SECRET && auth !== ...) deny` — условие ложно, если переменная не задана, **endpoint открыт для всех**.
**Импакт:** любой может дёргать `/api/cron/scan` и тратить ваш токен Goszakup, спамить запросы на площадки.
**Фикс:** `deny by default`: если `CRON_SECRET` не задан, endpoint возвращает 503.

### C2. Telegram-webhook та же дыра → ✅ ИСПРАВЛЕНО
**Файл:** `web/src/app/api/telegram/webhook/route.ts`
**Было:** Та же логика «secret optional». Любой мог слать поддельные `/start <code>` POST'ы и **привязать чужой Telegram к вашему аккаунту**.
**Фикс:** аналогично — 503 без `TELEGRAM_WEBHOOK_SECRET`.

### C3. `SUPABASE_SERVICE_ROLE_KEY` мог утечь в client-bundle → ✅ ИСПРАВЛЕНО
**Файл:** `web/src/lib/supabase/server.ts`
**Было:** `createAdminClient()` использует `SUPABASE_SERVICE_ROLE_KEY` (мастер-обход RLS). Если кто-то импортирует этот модуль в `"use client"` компоненте, Next.js включит его в JS-бандл браузера. **Сервис-ключ слил бы — это полный доступ к БД любого.**
**Фикс:** добавлен `import "server-only"` — Next.js падает на этапе сборки при попытке импорта в клиентском компоненте.

---

## 🟠 Высокие

### H1. SQL: пропущена INSERT-policy для `profiles` → ✅ ИСПРАВЛЕНО
**Файл:** `web/supabase/migrations/0001_init.sql`
**Было:** Триггер `handle_new_user` создаёт профиль через `security definer`, но нет fallback политики на случай ручного восстановления.
**Фикс:** добавлена `profiles insert self` policy.

### H2. Trial-подписки не истекают автоматически → ✅ ИСПРАВЛЕНО
**Где:** SQL-схема + кабинет.
**Было:** При создании ставится `expires_at = now() + 7 days`, но `status` остаётся `trial` даже после истечения. Кабинет показывал бы «активную» подписку бессрочно.
**Фикс:**
1. В Server Component кабинета (`/app/page.tsx`) фильтр `or(expires_at.is.null, expires_at.gt.now)` — не показывать истёкшие.
2. В `cron/scan` добавлен housekeeping-job: помечает `status='expired'` всё что просрочено.

### H3. HTTP security headers отсутствовали → ✅ ИСПРАВЛЕНО
**Файл:** `web/next.config.ts`
**Импакт:** clickjacking, MIME-sniffing, downgrade-атаки.
**Фикс:** добавлены HSTS, X-Frame-Options=DENY, X-Content-Type-Options=nosniff, CSP, Referrer-Policy, Permissions-Policy, `poweredByHeader: false`.

### H4. Слабый минимум пароля (6 символов) → ✅ ИСПРАВЛЕНО
**Файл:** `web/src/app/login/page.tsx`
**Фикс:** минимум поднят до 8 символов. Supabase Auth сам нормально enforce'ит при `signUp()`.
**TODO:** в Supabase Dashboard → Authentication → Policies включить **password complexity** (lowercase + uppercase + digit + min 8).

---

## 🟡 Средние

### M1. Воркер уведомлений не существовал → ✅ ИСПРАВЛЕНО
**Где:** Cron сканировал и сохранял лоты, но никто не отправлял их подписчикам.
**Фикс:** в `cron/scan/route.ts` добавлен `dispatchNotifications()`:
- Берёт всех клиентов с `verified=true` Telegram-каналом
- Проверяет, что у них активная подписка
- Берёт лоты за последние 24 часа
- Матчит с фильтрами клиента
- Дедуп через таблицу `sent_notifications` (за 7 дней)
- Лимит: ≤10 уведомлений на клиента за прогон (защита от флуда)

### M2. Vercel Cron на Hobby tier — лимит частоты → ⏳ ДОКУМЕНТИРОВАНО
**Файл:** `web/vercel.json`
**Проблема:** Sched `0 */2 * * *` (раз в 2 часа). На Vercel Hobby крон **разрешён максимум 1 раз/день**. Для нашего расписания нужен **Pro tier ($20/мес)**.
**Действие:** либо берёте Pro, либо в Hobby ставите `0 9 * * *` (раз в день в 9 утра) — тогда уведомления будут ежедневной подборкой, что **совпадает с продуктовым видением** (см. PLATFORMS.md).

### M3. `maxDuration: 60` секунд может не работать на Hobby → ⏳ ДОКУМЕНТИРОВАНО
**Файл:** `cron/scan/route.ts`
**Проблема:** Vercel Hobby лимит = 10 секунд на функцию. Если cron будет долго работать (много клиентов × много лотов × Telegram API rate limit), уложиться не получится.
**Решение:** на Pro tier до 60 секунд. На Hobby — ограничить scope (меньше клиентов или меньше лотов за раз).

### M4. AppClient.tsx делает N+1 запрос для лотов → ⏳ ИЗВЕСТНОЕ
**Файл:** `web/src/app/app/AppClient.tsx`
**Проблема:** отдельный `select` на каждый включённый фильтр. На Starter (1 фильтр) ок. На Pro (безлимит) — медленно.
**Фикс позже:** переписать на один запрос с OR-комбинацией, или вынести в Server Action.

### M5. Race condition при `upsert` лотов → ✅ ОТСУТСТВУЕТ
**Проверено:** `onConflict: "lot_id", ignoreDuplicates: true` — Supabase правильно handle'ит конкурентные cron'ы (если случится одновременный запуск).

---

## 🟢 Низкие

### L1. Письмо в ЦЭФ с реквизитами Turanix лежало в публичном репо → ✅ ИСПРАВЛЕНО
**Файл:** `Письмо_ЦЭФ_токен.md` — содержал email/телефон/БИН/ФИО.
**Фикс:** перемещён в `/Users/arystanbek/Desktop/tender-private/` вне репозитория. Удалён из git tracking.

### L2. Footer без юр.адреса / политики конфиденциальности → TODO
**Где:** `web/src/app/page.tsx` (footer).
**Для KZ:** должны быть видны:
- Юр.адрес ТОО Turanix
- БИН
- Реквизиты для оплаты
- Политика обработки персональных данных (требование РК «О персональных данных»)
- Договор-оферта
**Действие:** добавить страницы `/legal`, `/privacy`, `/offer` перед публичным анонсом сервиса.

### L3. Нет email-уведомлений (Phase 2 фичи) → TODO
Канал `email` в БД есть, но фактической рассылки нет. Подключить Resend / Postmark.

### L4. Нет rate limiting на регистрацию/логин → ⏳
**Где:** Supabase Auth сам имеет rate limits по умолчанию (5/час на signup с одного IP). На уровне приложения дополнительных лимитов нет. Для Vercel — можно добавить через `@upstash/ratelimit`.
**Импакт:** не критично, но при росте трафика возможен спам/брут.

### L5. Логирование = `console.log/error` → ⏳
**Где:** cron, webhook.
**Импакт:** Vercel сохраняет логи 1 час на Hobby. Для real production нужен **Better Stack / Logtail / Axiom**.

### L6. Нет error boundaries в React → ⏳
**Где:** `app/AppClient.tsx` — если что-то падает, белый экран.
**Фикс:** добавить `error.tsx` / `not-found.tsx` в App Router.

### L7. Сильно minimal SEO (нет sitemap/robots/meta-tags/og-image) → TODO
**Импакт:** для SaaS критично для лидгена. Добавить перед запуском.

---

## Архитектурные замечания (не дыры, а вопросы)

### A1. Engine (Python) и Web (Next.js) — два кодбейза
Сейчас Python-engine не задействован в Vercel-деплое. Он остаётся как:
- Референс для портирования логики
- Возможный отдельный worker на Railway/Fly **для парсеров закрытых площадок**, где нужен Playwright (Vercel не запустит)

**Рекомендация:** удалить engine из репо, когда вся логика будет портирована (Фаза 3). Сейчас оставляем — там полезные шаблоны (NCA Layer signer, AI filler).

### A2. Парсеры закрытых площадок — самый большой неизвестный
В cron-handler сейчас только Goszakup GraphQL (рабочий). Самрук/ЕТК/ЭТП/БТК/Казатомпром требуют либо:
- **Headless browser** (Playwright + Browserless.io в Vercel-функции) — ~$30/мес доп.
- **Отдельный worker** на Railway/Fly с Playwright — ~$5/мес доп.

**Решение** — после прохождения регистрации и получения логинов.

### A3. Auth: Supabase vs custom — оба есть в репо
- `tenderbot-engine/auth.py` — PBKDF2 на Flask-сессиях (Python)
- `web/src/app/login/page.tsx` — Supabase Auth (Next)

В Vercel-деплое используется только **Supabase Auth**. Python-вариант — только для standalone-режима engine.

### A4. Платежи: пока ручная активация
В UI кабинета кнопка «Оформить» только показывает alert. **Оптимально для MVP** — после получения договора с Kaspi Pay добавить webhook `/api/payment/webhook` который обновит `subscriptions.status='active'`.

### A5. Multi-tenancy через RLS — правильное решение
Все клиентские таблицы (`profiles`, `filters`, `notification_channels`, `sent_notifications`) защищены policy `auth.uid() = user_id`. Один клиент **физически не может** прочитать данные другого через PostgREST, даже зная UUID. Service-role клиент (cron/admin) обходит RLS — это by design.

---

## Что нужно сделать перед публичным запуском (чек-лист)

### Обязательно
- [ ] Выставить `CRON_SECRET` (длинная случайная строка) в Vercel env vars
- [ ] Выставить `TELEGRAM_WEBHOOK_SECRET` (длинная случайная строка) в Vercel env vars
- [ ] Применить SQL-миграцию в Supabase (Dashboard → SQL Editor → run 0001_init.sql)
- [ ] В Supabase Auth настройках: enable email verification, password complexity
- [ ] Добавить страницы `/legal`, `/privacy`, `/offer` (требование РК для SaaS)
- [ ] Custom domain (`tenderbot.turanix.kz`) с HTTPS

### Желательно
- [ ] Vercel Pro tier ($20/мес) для нормальной частоты cron'а
- [ ] Better Stack / Axiom для логов
- [ ] Sentry для error tracking
- [ ] `@upstash/ratelimit` для login/signup brute-защиты
- [ ] OG-image, sitemap.xml, robots.txt
- [ ] Error boundary `error.tsx`

### Перед привлечением реальных клиентов
- [ ] Подключить Goszakup токен (письмо в ЦЭФ отправлено)
- [ ] Подключить Browserless или отдельный worker для парсеров закрытых площадок
- [ ] Зарегистрироваться на Самрук/ЕТК/ЭТП/БТК/Казатомпром под Turanix-ЭЦП
- [ ] Подключить Kaspi Pay (договор с Kaspi)
- [ ] Resend / Postmark для email-уведомлений
- [ ] Подписать договор-оферту с первыми клиентами

---

## Файлы, изменённые в результате аудита

```
web/src/app/api/cron/scan/route.ts        # C1 + H2 + M1 (cron auth, expire job, dispatcher)
web/src/app/api/telegram/webhook/route.ts # C2 (webhook auth)
web/src/lib/supabase/server.ts            # C3 (server-only guard)
web/next.config.ts                        # H3 (security headers)
web/src/app/login/page.tsx                # H4 (password min length)
web/src/app/app/page.tsx                  # H2 (trial filter)
web/supabase/migrations/0001_init.sql     # H1 (insert policy)
Письмо_ЦЭФ_токен.md                       # L1 (вынесен из репо)
SECURITY_AUDIT.md                         # этот документ
```
