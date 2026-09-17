"""
Scrapling LinkedIn Scraper Service — configuration.

All configuration comes from environment variables (or a local .env file).
Secrets never leave the server: this service is internal-only and is called
by the Next.js backend with a shared internal token.
"""

import os
from dataclasses import dataclass, field

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


@dataclass
class Settings:
    # ── Service ────────────────────────────────────────────────
    internal_token: str = field(default_factory=lambda: _env("SCRAPER_INTERNAL_TOKEN"))
    port: int = field(default_factory=lambda: int(_env("SCRAPER_PORT", "8100")))

    # ── Scraper mode ───────────────────────────────────────────
    # "scrapling"  = live scraping via Scrapling library (Fetcher / StealthyFetcher)
    # "mock"       = deterministic local data, zero external requests
    mode: str = field(default_factory=lambda: _env("SCRAPER_MODE", "scrapling").lower())

    # ── Scrapling settings ─────────────────────────────────────
    # "auto"  = Fetcher first, escalate to StealthyFetcher on failure
    # "fetch" = Fetcher only (fast, no browser)
    # "stealth" = StealthyFetcher only (bypasses Cloudflare etc.)
    # "dynamic" = DynamicFetcher (full Playwright browser, slowest but most reliable)
    fetch_mode: str = field(default_factory=lambda: _env("SCRAPER_FETCH_MODE", "auto"))

    # Search discovery: DuckDuckGo HTML + Google + agent-reach Exa (when installed)
    search_results_per_query: int = field(default_factory=lambda: int(_env("SCRAPER_SEARCH_RESULTS", "10")))
    max_concurrent_extractions: int = field(default_factory=lambda: int(_env("SCRAPER_MAX_CONCURRENCY", "3")))
    extraction_timeout_seconds: int = field(default_factory=lambda: int(_env("SCRAPER_EXTRACTION_TIMEOUT", "60")))
    # Delay between fetches to be polite (seconds)
    fetch_delay: float = field(default_factory=lambda: float(_env("SCRAPER_FETCH_DELAY", "2.0")))

    # ── agent-reach channels ──────────────────────────────────
    # off (default) = Scrapling fetchers only — Scrapling IS the scraper
    # on            = Jina Reader (web channel) as last-resort fallback
    agent_reach: str = field(default_factory=lambda: _env("SCRAPER_AGENT_REACH", "off").lower())
    jina_timeout_seconds: int = field(default_factory=lambda: int(_env("JINA_READER_TIMEOUT", "45")))
    # Optional free key from jina.ai — raises rate limits, never required
    jina_api_key: str = field(default_factory=lambda: _env("JINA_API_KEY"))

    # ── Cache ─────────────────────────────────────────────────
    cache_ttl_minutes: int = field(default_factory=lambda: int(_env("SCRAPER_CACHE_TTL_MINUTES", "30")))
    cache_max_entries: int = field(default_factory=lambda: int(_env("SCRAPER_CACHE_MAX_ENTRIES", "200")))

    # ── Safety limits ─────────────────────────────────────────
    max_posts_per_request: int = field(default_factory=lambda: int(_env("SCRAPER_MAX_POSTS", "40")))
    max_keyword_length: int = 120
    allowed_days: tuple = (1, 3, 7, 14, 30, 90)

    @property
    def use_scrapling(self) -> bool:
        return self.mode == "scrapling"


settings = Settings()
