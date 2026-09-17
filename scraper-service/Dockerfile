FROM python:3.11-slim

WORKDIR /srv

# System deps for Scrapling + Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl git libglib2.0-0 libnss3 libnspr4 \
    libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && python -m playwright install chromium --with-deps

COPY app ./app

ENV SCRAPER_PORT=8100
EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD curl -sf http://localhost:8100/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
