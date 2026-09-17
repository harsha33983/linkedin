"""
Scraper service tests: URL extraction, viral score, cache, schemas, mock.

Run:  cd scraper-service && python -m pytest tests/ -q
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.providers.scrapling_provider import extract_post_urls  # noqa: E402
from app.services.viral_score import calculate_viral_score  # noqa: E402
from app.services.cache import cache_key, get_cached, set_cached  # noqa: E402
from app.providers.mock import mock_search  # noqa: E402
from app.schemas import ScrapedPost  # noqa: E402


# ── URL extraction / dedup ────────────────────────────────────────
def test_extract_post_urls_finds_and_dedupes():
    blob = """
    https://www.linkedin.com/posts/priya-raman_ai-tools-activity-1234567890-abc
    https://se.linkedin.com/posts/marcus growth-tips-activity-999
    https://www.linkedin.com/posts/priya-raman_ai-tools-activity-1234567890-abc/
    https://twitter.com/someone/status/1
    https://www.linkedin.com/in/just-a-profile
    """
    urls = extract_post_urls(blob)
    assert len(urls) == 2
    assert all("linkedin.com/posts/" in u for u in urls)


def test_extract_post_urls_empty():
    assert extract_post_urls("") == []
    assert extract_post_urls("no urls here") == []


# ── Viral score ───────────────────────────────────────────────────
def _post(reactions=0, comments=0, reposts=0, published_at=None):
    return {
        "reactions": reactions,
        "comments": comments,
        "reposts": reposts,
        "publishedAt": published_at,
    }


def test_viral_score_zero_when_no_engagement():
    assert calculate_viral_score(_post()) == 0.0


def test_viral_score_rewards_engagement_not_reactions_only():
    big_reactions = calculate_viral_score(_post(reactions=5000))
    balanced = calculate_viral_score(_post(reactions=2000, comments=300, reposts=80))
    assert balanced > big_reactions * 0.6  # discussion-rich post stays competitive


def test_viral_score_recency_penalty():
    from datetime import datetime, timedelta, timezone

    old = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    fresh = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
    assert calculate_viral_score(_post(reactions=1000, published_at=fresh)) > \
        calculate_viral_score(_post(reactions=1000, published_at=old))


def test_viral_score_bounded():
    huge = calculate_viral_score(_post(reactions=999_999, comments=99_999, reposts=99_999))
    assert 0.0 <= huge <= 100.0


# ── Cache ─────────────────────────────────────────────────────────
def test_cache_roundtrip_and_expiry(monkeypatch):
    set_cached("AI", 14, {"posts": [1, 2, 3]})
    key = cache_key("ai", 14)
    assert get_cached("AI", 14) == {"posts": [1, 2, 3]}
    # TTL expiry
    from app.services import cache as cache_mod

    stored_at, payload = cache_mod._store[key]
    cache_mod._store[key] = (stored_at - 10_000, payload)
    assert get_cached("AI", 14) is None


# ── Mock provider ────────────────────────────────────────────────
def test_mock_search_deterministic_and_complete():
    a = mock_search("AI", 14, 10)
    b = mock_search("AI", 14, 10)
    assert a == b  # deterministic
    assert len(a) == 10
    post = ScrapedPost(**{k: v for k, v in a[0].items() if k in ScrapedPost.model_fields})
    assert post.sourceUrl and post.content and post.reactions > 0


# ── Schema validation ────────────────────────────────────────────
def test_scraped_post_allows_nulls():
    p = ScrapedPost()
    assert p.reactions is None and p.author is None and p.hashtags == []


# ── Scrapling provider (unit) ────────────────────────────────────
def test_extract_post_urls_from_ddg_html():
    """Simulate DuckDuckGo search result HTML containing LinkedIn URLs."""
    html = """
    <a class="result__a" href="https://www.linkedin.com/posts/user1_ai-post-activity-123456789">
    <a class="result__a" href="https://www.linkedin.com/posts/user2_great-thread-activity-987654321">
    <a class="result__a" href="https://example.com/not-linkedin">
    """
    urls = extract_post_urls(html)
    assert len(urls) == 2
    assert "activity-123456789" in urls[0]
    assert "activity-987654321" in urls[1]


def test_extract_post_urls_deduplicates_trailing_slash():
    urls = extract_post_urls(
        "https://www.linkedin.com/posts/x-y-activity-1/ "
        "https://www.linkedin.com/posts/x-y-activity-1"
    )
    assert len(urls) == 1
