"""
Scrapling LinkedIn scraper service entrypoint.

Run:
    uvicorn app.main:app --host 127.0.0.1 --port 8100

Internal-only service called by the Next.js backend.
"""

import logging

from fastapi import FastAPI

from .config import settings
from .routes.linkedin import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(title="LinkedGrow Scraper Service", docs_url=None, redoc_url=None)
app.include_router(router)


@app.on_event("startup")
async def _startup() -> None:
    logging.getLogger("scraper").info(
        "scraper service starting: mode=%s fetch_mode=%s ttl=%dmin",
        settings.mode,
        settings.fetch_mode,
        settings.cache_ttl_minutes,
    )
