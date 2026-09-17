"""
In-process cache for scraper results.

Key: normalized "keyword:days" pair. TTL: SCRAPER_CACHE_TTL_MINUTES.
This prevents every SaaS user from triggering a fresh scrape — the Next.js
layer also persists results to Postgres, but this cache absorbs bursts.
"""

import logging
import time
from collections import OrderedDict
from typing import Optional

from ..config import settings

logger = logging.getLogger("scraper.cache")

_store: "OrderedDict[str, tuple[float, dict]]" = OrderedDict()


def cache_key(keyword: str, days: int) -> str:
    return f"viral_posts:{keyword.strip().lower()}:{days}d"


def get_cached(keyword: str, days: int) -> Optional[dict]:
    key = cache_key(keyword, days)
    entry = _store.get(key)
    if not entry:
        logger.info("cache miss: %s", key)
        return None
    stored_at, payload = entry
    if time.time() - stored_at > settings.cache_ttl_minutes * 60:
        _store.pop(key, None)
        logger.info("cache expired: %s", key)
        return None
    _store.move_to_end(key)
    logger.info("cache hit: %s", key)
    return payload


def set_cached(keyword: str, days: int, payload: dict) -> None:
    key = cache_key(keyword, days)
    _store[key] = (time.time(), payload)
    _store.move_to_end(key)
    while len(_store) > settings.cache_max_entries:
        _store.popitem(last=False)
    logger.info("cache set: %s", key)
