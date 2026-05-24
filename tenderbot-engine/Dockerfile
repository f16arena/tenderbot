# TenderBot — multi-process контейнер: Flask + APScheduler + (опционально) Telegram-бот.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

# Системные зависимости для Playwright (если будете гонять браузеры в этом же контейнере;
# для прода рекомендую вынести парсеры в отдельный воркер).
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

EXPOSE 8080

# main.py сам поднимает Flask на host:0.0.0.0 + APScheduler + (опц.) Telegram-бот.
# На проде WEB_PORT=8080 (Railway/Render передают PORT в env, ниже подстраиваемся).
CMD ["sh", "-c", "WEB_PORT=${PORT:-8080} python main.py"]
