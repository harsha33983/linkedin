"""
Scrapling provider — the ONLY place that touches the scrapling library.

Two responsibilities:
  1. URL discovery: Google via StealthyFetcher (renders JS, passes bot
     checks); DDG html via the plain Fetcher as a cheap first attempt.
  2. Post extraction: fetch the public post page with the plain Fetcher
     (chrome TLS impersonation) and parse the embedded JSON-LD
     (schema.org DiscussionForumPosting) which LinkedIn publishes on every
     public post: author, articleBody, datePublished, commentCount,
     LikeAction count, image. CSS selectors are the fallback.

Compliance rules:
  - Only publicly accessible pages are processed. If a page refuses access
    or requires login, it is SKIPPED — no session cookies, no login
    automation, no CAPTCHA solving.
  - Missing fields stay null; nothing is invented.
"""

import asyncio
import json
import logging
import re
import time
from typing import Callable, List, Optional

from ..config import settings

logger = logging.getLogger("scraper.scrapling")

# ── URL patterns ──────────────────────────────────────────────────
POST_URL_PATTERN = re.compile(
    r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:posts|pulse|feed/update)/[^\s\"'<>?#&]+",
    re.IGNORECASE,
)

# ── Search query templates ───────────────────────────────────────
# Brave chokes on quoted phrases inside site: queries — keep those unquoted.
BRAVE_QUERIES = [
    'site:linkedin.com/posts/ {kw}',
    'site:linkedin.com/posts/ {kw} insights',
    'site:linkedin.com/posts/ {kw} week',
]

# Google handles quoted phrases correctly and respects path-scoped site:.
SEARCH_QUERIES = [
    'site:linkedin.com/posts/ "{kw}"',
    'site:linkedin.com/posts/ {kw} insights',
    'site:linkedin.com/posts/ best {kw} posts',
    'site:linkedin.com/pulse/ {kw}',
]

# ── Engine cooldowns ──────────────────────────────────────────────
# Google/DDG/Brave serve CAPTCHAs per-IP under load; once an engine returns
# a challenge page (zero recoverable URLs) we skip it for a while instead
# of hammering it and extending the block.
_engine_cooldown: dict = {}


def _engine_available(name: str) -> bool:
    return time.monotonic() >= _engine_cooldown.get(name, 0)


def _mark_engine_down(name: str, minutes: int = 5) -> None:
    _engine_cooldown[name] = time.monotonic() + minutes * 60
    logger.info("engine %s cooling down for %d min", name, minutes)


# ── Activity-ID timestamps ────────────────────────────────────────
# A LinkedIn post URL carries activity-<id>; the top bits of that id encode
# the post's creation time (id >> 22 = ms since epoch). This lets us drop
# out-of-window URLs BEFORE spending an extraction request on them.
_ACTIVITY_ID = re.compile(r"activity-(\d{15,20})")


def _activity_age_days(url: str) -> Optional[float]:
    m = _ACTIVITY_ID.search(url or "")
    if not m:
        return None
    ts_ms = int(m.group(1)) >> 22
    if ts_ms <= 0:
        return None
    return (time.time() * 1000 - ts_ms) / 86_400_000


def _url_within_window(url: str, days: int) -> bool:
    """Cheap recency filter on the URL itself. URLs without a timestamp are
    kept — the extraction-stage window filter catches those."""
    age = _activity_age_days(url)
    if age is None:
        return True
    return age <= days + 1

# ── LinkedIn post selectors (CSS fallback) ───────────────────────
# JSON-LD is the primary source; these cover pages without it.
SELECTORS = {
    "content_text": ".attributed-text-segment-list__content",
    "hashtags": "a[href*='hashtag'], a[data-tracking-control-name*='hashtag']",
    "reactions": ".social-details-social-counts__social-credential-text, .social-details-reactors-count__text",
    "comments": ".social-details-social-counts__num-replies, .social-details-social-counts__comments button span[aria-hidden='true']",
    "reposts": ".social-details-social-counts__reposts-count",
}


def extract_post_urls(text: str) -> List[str]:
    """Pull unique LinkedIn post URLs out of any blob of search-result text."""
    seen, urls = set(), []
    for match in POST_URL_PATTERN.finditer(text or ""):
        url = match.group(0).rstrip(".,);:!]")
        key = url.rstrip("/").lower()
        if key not in seen:
            seen.add(key)
            urls.append(url)
    return urls


def _run_sync(fn, timeout: float):
    """Run a blocking scrapling fetch in an executor with a timeout."""
    loop = asyncio.get_running_loop()
    return asyncio.wait_for(loop.run_in_executor(None, fn), timeout=timeout)


def _stealthy_get(url: str):
    """Blocking StealthyFetcher fetch (renders JS, passes bot checks)."""
    from scrapling.fetchers import StealthyFetcher
    return StealthyFetcher.fetch(url, headless=True, timeout=45_000)


def _fetcher_get(url: str):
    """Blocking plain Fetcher fetch (chrome TLS impersonation)."""
    from scrapling.fetchers import Fetcher
    return Fetcher.get(url, stealthy_headers=True, impersonate="chrome", follow_redirects=True, timeout=30)


def _page_text(page) -> str:
    html = getattr(page, "html_content", None)
    if not html and getattr(page, "body", None):
        try:
            html = page.body.decode("utf-8", errors="ignore")
        except Exception:
            html = ""
    return html or ""


def _google_tbs(days: int) -> str:
    """days -> Google tbs recency parameter (so results match the user's window)."""
    if days <= 1:
        return "qdr:d"
    if days <= 7:
        return "qdr:w"
    if days <= 30:
        return "qdr:m"
    if days <= 60:
        return "qdr:m2"
    return "qdr:m3"


def _ddg_df(days: int) -> str:
    """days -> DuckDuckGo df (date filter) parameter."""
    if days <= 1:
        return "d"
    if days <= 7:
        return "w"
    return "m"


async def _google_search_html(query: str, days: int) -> str:
    """Google search via StealthyFetcher (JS rendering passes bot checks).
    Always applies the user's recency window via the tbs parameter."""
    url = (
        f"https://www.google.com/search?q={query.replace(' ', '+')}"
        f"&num=30&hl=en&tbs={_google_tbs(days)}"
    )
    try:
        page = await _run_sync(lambda: _stealthy_get(url), 90)
        return _page_text(page)
    except Exception as exc:
        logger.warning("google search failed for %r: %s", query[:60], exc)
        return ""


async def _ddg_search_html(query: str, days: int) -> str:
    """DuckDuckGo html endpoint via plain Fetcher (cheap fallback attempt).
    NOTE: DDG ignores path-scoped site: operators — results are diluted, but
    occasionally include post URLs; kept as a last plain-HTTP engine."""
    try:
        page = await _run_sync(
            lambda: _fetcher_get(
                "https://html.duckduckgo.com/html/?q="
                + query.replace(" ", "+")
                + f"&df={_ddg_df(days)}"
            ),
            45,
        )
        return _page_text(page)
    except Exception as exc:
        logger.warning("ddg search failed for %r: %s", query[:60], exc)
        return ""


async def _brave_search_html(query: str, days: int) -> str:
    """Brave Search via plain Fetcher — the primary engine because it honors
    path-scoped site:linkedin.com/posts/ queries (Google does too but is
    frequently IP-challenged; DDG/Bing ignore the path scope entirely).
    Brave sometimes embeds a captcha widget while STILL serving organic
    results, so it is only treated as challenged when zero URLs come back."""
    try:
        page = await _run_sync(
            lambda: _fetcher_get(
                "https://search.brave.com/search?q="
                + query.replace(" ", "+")
            ),
            45,
        )
        return _page_text(page)
    except Exception as exc:
        logger.warning("brave search failed for %r: %s", query[:60], exc)
        return ""


async def discover_post_urls(keyword: str, days: int, limit: int = 40) -> List[str]:
    """
    Discover public LinkedIn post URLs matching the user's recency window.

    Engine chain: Brave (respects path-scoped site:, plain HTTP) → Google via
    StealthyFetcher (tbs recency applied) → DuckDuckGo (diluted but cheap)
    → agent-reach Exa hook. Challenged engines are put on cooldown instead
    of being retried, and every engine's URLs are age-filtered via the
    activity-id timestamp before extraction.
    """
    collected: List[str] = []
    seen: set = set()

    def add(urls: List[str]) -> None:
        for u in urls:
            if not _url_within_window(u, days):
                continue
            key = u.rstrip("/").lower()
            if key not in seen:
                seen.add(key)
                collected.append(u)

    engines = [
        ("brave", BRAVE_QUERIES, _brave_search_html),
        ("google", SEARCH_QUERIES, _google_search_html),
        ("ddg", SEARCH_QUERIES, _ddg_search_html),
    ]
    pace = max(1.0, settings.fetch_delay)

    # If EVERY engine is on cooldown we would return zero URLs and the UI
    # would show "temporarily unavailable". Instead, always force-probe the
    # single most reliable engine (brave) with its first query — one polite
    # request is far better than a guaranteed empty result, and a challenged
    # probe simply re-arms its cooldown.
    all_cooling = all(not _engine_available(name) for name, _, _ in engines)
    if all_cooling:
        logger.info("all engines cooling down — force-probing brave once")
        _engine_cooldown.pop("brave", None)

    for name, queries, fn in engines:
        if len(collected) >= limit:
            break
        if not _engine_available(name):
            logger.info("skipping engine %s (cooldown)", name)
            continue
        for q in queries:
            html = await fn(q.format(kw=keyword), days)
            await asyncio.sleep(pace)
            add(extract_post_urls(html))
            if len(collected) >= limit:
                break
        if not collected:
            _mark_engine_down(name)

    # agent-reach Exa semantic search when installed (mcporter + Exa MCP).
    if len(collected) < limit:
        try:
            from .agent_reach_provider import exa_discover_post_urls
            exa_urls = await exa_discover_post_urls(keyword, min(limit, 10))
            add(exa_urls)
        except Exception as exc:
            logger.info("exa discovery skipped: %s", exc)

    logger.info(
        "discovered %d unique post URLs for keyword=%r (window %dd)",
        len(collected), keyword, days,
    )
    return collected[:limit]


def _parse_ld_interactions(data: dict) -> tuple:
    """Return (reactions, comments) from the JSON-LD interactionStatistic."""
    reactions = comments = None
    for s in data.get("interactionStatistic") or []:
        if not isinstance(s, dict):
            continue
        kind = (s.get("interactionType") or "").rsplit("/", 1)[-1].lower()
        try:
            count = int(s.get("userInteractionCount"))
        except (TypeError, ValueError):
            continue
        if kind == "likeaction":
            reactions = count
        elif kind == "commentaction":
            comments = count
    return reactions, comments


def _extract_from_jsonld(page, post_url: str) -> Optional[dict]:
    """Parse the embedded JSON-LD (DiscussionForumPosting, VideoObject, Article)."""
    els = page.css('script[type="application/ld+json"]')
    if not els:
        return None
    try:
        data = json.loads(els[0].text)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    accepted = {"DiscussionForumPosting", "VideoObject", "Article", "SocialMediaPosting"}
    if data.get("@type") not in accepted:
        return None

    # VideoObject uses "creator", forum postings use "author"
    author = data.get("author") or data.get("creator") or {}
    author_image = (author.get("image") or {}).get("url") if isinstance(author.get("image"), dict) else None

    # Media: image.url (forum) or thumbnailUrl (video; str or list)
    media_image = (data.get("image") or {}).get("url") if isinstance(data.get("image"), dict) else None
    if not media_image:
        thumb = data.get("thumbnailUrl")
        if isinstance(thumb, list) and thumb:
            media_image = thumb[0]
        elif isinstance(thumb, str):
            media_image = thumb

    reactions, comments = _parse_ld_interactions(data)
    if comments is None:
        try:
            comments = int(data.get("commentCount"))
        except (TypeError, ValueError):
            pass

    # Content: articleBody > description > headline/name
    content = data.get("articleBody") or data.get("description") or data.get("headline") or data.get("name")

    hashtags = sorted({m.group(0) for m in re.finditer(r"#[\w-]+", content or "")})

    post_id_match = re.search(r"activity-(\d+)", post_url)
    return {
        "sourceUrl": data.get("@id") or post_url,
        "postId": post_id_match.group(1) if post_id_match else None,
        "author": {
            "name": author.get("name"),
            "headline": None,  # JSON-LD carries no headline
            "profileUrl": author.get("url"),
            "avatarUrl": author_image,
        },
        "content": content,
        "publishedAt": data.get("datePublished") or data.get("uploadDate"),
        "reactions": reactions,
        "comments": comments,
        "reposts": None,  # not exposed in JSON-LD; scoring treats null as 0
        "mediaUrl": media_image,
        "mediaType": "video" if data.get("@type") == "VideoObject" else ("image" if media_image else None),
        "hashtags": hashtags,
        "topics": [],
    }


def _try_extract_html(post_url: str, html: str) -> Optional[dict]:
    """Extract structured data from ALREADY-FETCHED page HTML (JSON-LD first, CSS fallback)."""
    low = html.lower()
    if "authwall" in low or ("sign in" in low and len(html) < 8_000):
        logger.info("login wall, skipping: %s", post_url[:80])
        return None

    page = _wrap_html(html)
    result = _extract_from_jsonld(page, post_url)

    # CSS fallback for pages without JSON-LD (rare)
    if result is None or not result.get("content"):
        content_els = page.css(SELECTORS["content_text"])
        content = "\n".join(
            el.text.strip() for el in content_els[:1] if el.text.strip()
        ) or None

        def _count(key: str) -> Optional[int]:
            for el in page.css(SELECTORS[key]):
                t = (el.text or "").strip().replace(",", "").upper().replace(" ", "").replace("+", "")
                try:
                    if "K" in t:
                        return int(float(t.replace("K", "")) * 1_000)
                    if "M" in t:
                        return int(float(t.replace("M", "")) * 1_000_000)
                    return int(t) if t.isdigit() else None
                except ValueError:
                    continue
            return None

        if content:
            hashtags = sorted({el.text.strip() for el in page.css(SELECTORS["hashtags"]) if el.text.strip()})
            post_id_match = re.search(r"activity-(\d+)", post_url)
            result = {
                "sourceUrl": post_url,
                "postId": post_id_match.group(1) if post_id_match else None,
                "author": {"name": None, "headline": None, "profileUrl": None, "avatarUrl": None},
                "content": content,
                "publishedAt": None,
                "reactions": _count("reactions"),
                "comments": _count("comments"),
                "reposts": _count("reposts"),
                "mediaUrl": None,
                "mediaType": None,
                "hashtags": [h if h.startswith("#") else "#" + h.lstrip("#") for h in hashtags],
                "topics": [],
            }

    if result is None or (not result.get("content") and result.get("reactions") is None):
        logger.info("no data extracted: %s", post_url[:80])
        return None
    return result


def _wrap_html(html: str):
    """Parse raw HTML into a scrapling page object for selector use."""
    from scrapling.parser import Selector
    return Selector(html)


def _try_extract(post_url: str, fetcher_fn) -> Optional[dict]:
    """Fetch a public LinkedIn post and extract data (JSON-LD first, CSS fallback)."""
    try:
        page = fetcher_fn(post_url)
        html = _page_text(page)
        if not html:
            return None
        return _try_extract_html(post_url, html)
    except Exception as exc:
        logger.info("extraction failed (%s): %s", type(exc).__name__, post_url[:80])
        return None


def _extract_with_fetcher(url: str) -> Optional[dict]:
    """Sync-only fallback path (Jina is handled in the async extract_post)."""
    return _extract_with_fetchers_sync(url)


def _extract_with_fetchers_sync(url: str) -> Optional[dict]:
    """Plain Fetcher first; escalate per SCRAPER_FETCH_MODE on failure."""
    result = _try_extract(url, _fetcher_get)
    if result is None and settings.fetch_mode == "auto":
        logger.info("escalating to StealthyFetcher: %s", url[:80])
        result = _try_extract(url, _stealthy_get)
    return result


async def extract_post(url: str) -> Optional[dict]:
    """Extract public post data from a single LinkedIn post URL.

    Scrapling is the scraper: Fetcher (chrome TLS impersonation) first,
    escalating to StealthyFetcher (JS-rendering browser) per SCRAPER_FETCH_MODE.
    The agent-reach Jina Reader is only a LAST-RESORT fallback and stays off
    unless SCRAPER_AGENT_REACH=on.
    """
    try:
        result = await _run_sync(lambda: _extract_with_fetchers_sync(url), settings.extraction_timeout_seconds)
        if result is not None:
            return result

        if settings.agent_reach == "on":
            from . import agent_reach_provider
            html = await agent_reach_provider.fetch_page_html(url)
            if html:
                result = _try_extract_html(url, html)
                if result is not None:
                    logger.info("scrapling failed, jina fallback succeeded: %s", url[:80])
                    return result

        logger.info("scrapling extraction produced no data: %s", url[:80])
        return None
    except asyncio.TimeoutError:
        logger.info("extraction timeout (skipped): %s", url[:80])
        return None
    except Exception as exc:
        logger.info("post skipped (%s): %s", type(exc).__name__, url[:80])
        return None


async def extract_many(
    urls: List[str],
    concurrency: Optional[int] = None,
    on_result: Optional[Callable[[str, Optional[dict]], None]] = None,
    pace_seconds: float = 0.0,
) -> List[Optional[dict]]:
    """Extract many post URLs with bounded concurrency."""
    sem = asyncio.Semaphore(concurrency or settings.max_concurrent_extractions)

    async def one(u: str) -> Optional[dict]:
        async with sem:
            if pace_seconds:
                await asyncio.sleep(pace_seconds)
            result = await extract_post(u)
            if on_result:
                on_result(u, result)
            return result

    return await asyncio.gather(*(one(u) for u in urls))
