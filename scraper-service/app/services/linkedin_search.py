"""
Search orchestration: discover public post URLs → extract → normalize → score.

search_linkedin_posts(keyword, days, limit) is the single reusable entry point
used by both /scrape/linkedin/search and /scrape/linkedin/refresh.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import List

from ..config import settings
from ..providers import mock as mock_provider
from ..providers import scrapling_provider as scrapling
from ..schemas import ScrapedPost
from .cache import get_cached, set_cached
from .viral_score import calculate_viral_score

logger = logging.getLogger("scraper.search")


def _normalize(raw: dict, url: str) -> ScrapedPost:
    """Coerce a raw extraction into the ScrapedPost schema (nulls preserved)."""
    author = raw.get("author") or {}
    if isinstance(author, dict):
        author_data = {
            "name": author.get("name"),
            "headline": author.get("headline"),
            "profileUrl": author.get("profileUrl") or author.get("url"),
            "avatarUrl": author.get("avatarUrl") or author.get("image"),
        }
    else:
        author_data = {"name": str(author) if author else None}

    def to_int(v):
        if v is None:
            return None
        try:
            return int(str(v).replace(",", "").strip())
        except Exception:
            return None

    def to_list(v):
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        if isinstance(v, str) and v.strip():
            return [v.strip()]
        return []

    return ScrapedPost(
        sourceUrl=url or raw.get("sourceUrl"),
        postId=raw.get("postId"),
        author=author_data,
        content=raw.get("content") or raw.get("text"),
        publishedAt=raw.get("publishedAt") or raw.get("date"),
        reactions=to_int(raw.get("reactions")),
        comments=to_int(raw.get("comments")),
        reposts=to_int(raw.get("reposts")) or to_int(raw.get("shares")),
        mediaUrl=raw.get("mediaUrl") or raw.get("image"),
        mediaType=raw.get("mediaType"),
        hashtags=to_list(raw.get("hashtags")),
        topics=to_list(raw.get("topics")),
    )


def _within_window(published_at, days: int) -> bool:
    """True when a post's date is within the user's selected window (or unknown)."""
    if not published_at:
        return True
    try:
        dt = datetime.fromisoformat(str(published_at).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age_days = (datetime.now(timezone.utc) - dt).total_seconds() / 86_400
        return age_days <= max(days, 1)
    except Exception:
        return True


async def search_linkedin_posts(keyword: str, days: int, limit: int) -> dict:
    """
    Returns { posts: [post dicts with viralScore], status, mode, found,
    extracted, failed }.
    """
    cached = get_cached(keyword, days)
    if cached:
        cached = dict(cached)
        cached["posts"] = cached["posts"][:limit]
        return cached

    found = extracted = failed = 0
    posts: List[ScrapedPost] = []
    status = "ok"

    if settings.use_scrapling:
        try:
            urls = await scrapling.discover_post_urls(keyword, days, limit)
            found = len(urls)
            logger.info("scrapling search started keyword=%r → %d urls", keyword, found)

            results = await scrapling.extract_many(
                urls[:limit],
                concurrency=settings.max_concurrent_extractions,
                pace_seconds=0.5,  # Jina tolerates short gaps; its fetcher retries on 429
            )
            for url, raw in zip(urls[:limit], results):
                if raw is None:
                    failed += 1
                    continue
                try:
                    normalized = _normalize(raw, url)
                    if not _within_window(normalized.publishedAt, days):
                        failed += 1  # older than the user's selected window — skip
                        continue
                    posts.append(normalized)
                    extracted += 1
                except Exception:
                    failed += 1
        except Exception as exc:
            logger.error("scrapling search failed: %s", exc)
            status = "temporarily_unavailable"
    else:
        status = "mock"
        raw_posts = mock_provider.mock_search(keyword, days, limit)
        found = len(raw_posts)
        posts = [_normalize(raw, raw.get("sourceUrl") or "") for raw in raw_posts]
        extracted = len(posts)

    # Score + sort + trim
    scored = []
    for p in posts:
        d = p.model_dump()
        d["viralScore"] = calculate_viral_score(d)
        scored.append(d)
    scored.sort(key=lambda x: x["viralScore"], reverse=True)
    scored = scored[:limit]

    # Discovery produced nothing at all → the search engines are blocking us
    # (challenge/captcha), which IS an outage. A successful scrape that simply
    # found no in-window posts stays "ok" (legit empty state, no banner).
    if status == "ok" and found == 0:
        status = "temporarily_unavailable"

    payload = {
        "posts": scored,
        "status": status,
        "mode": settings.mode,
        "found": found,
        "extracted": extracted,
        "failed": failed,
    }
    if status in ("ok", "mock") and scored:
        set_cached(keyword, days, payload)
    return payload
