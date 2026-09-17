"""
agent-reach provider — the agent-reach integration layer.

agent-reach (github.com/Panniantong/agent-reach) is a capability router that
exposes upstream channels. Two of its channels are used here:

  web         -> Jina Reader (https://r.jina.ai/URL) — reads any public page.
                With `X-Return-Format: html` it returns the raw DOM, so the
                JSON-LD extraction in scrapling_provider works unchanged.
                Zero config, fast (~2s), and bypasses IP-level fetch issues.
  exa_search  -> Exa semantic search via mcporter (npm i -g mcporter;
                mcporter config add exa https://mcp.exa.ai/mcp --scope home).
                Used for URL DISCOVERY when installed; skipped gracefully
                when absent (Google/DDG remain the fallback engines).

Compliance: Jina Reader fetches publicly accessible pages only; the LinkedIn
MCP channel requires an interactive user login and is deliberately NOT used.
"""

import asyncio
import json
import logging
import shutil
from typing import List

import httpx

from ..config import settings

logger = logging.getLogger("scraper.agent_reach")

JINA_BASE = "https://r.jina.ai"
_MCPORTER_TIMEOUT_SECONDS = 90
JINA_ATTEMPTS = 2          # initial try + 1 retry (Jina rate-limits are transient)
JINA_RETRY_PAUSE_SECONDS = 2.0


# ── web channel: Jina Reader ──────────────────────────────────────

def _jina_headers() -> dict:
    headers = {"X-Return-Format": "html"}
    # Optional: a free jina.ai key raises rate limits; never required.
    key = settings.jina_api_key
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


async def fetch_page_html(url: str) -> str:
    """Read a public page through agent-reach's web channel (Jina Reader).

    Retries once on failure/429 (Jina's keyless rate limits are transient).
    Returns the raw HTML (JSON-LD intact) or "" on any failure.
    """
    for attempt in range(1, JINA_ATTEMPTS + 1):
        try:
            async with httpx.AsyncClient(timeout=settings.jina_timeout_seconds, follow_redirects=True) as client:
                resp = await client.get(f"{JINA_BASE}/{url}", headers=_jina_headers())
                if resp.status_code == 200 and resp.text:
                    return resp.text
                logger.info("jina reader attempt %d skipped %s (%d)", attempt, url[:80], resp.status_code)
        except Exception as exc:
            logger.info("jina reader attempt %d failed (%s): %s", attempt, type(exc).__name__, url[:80])
        if attempt < JINA_ATTEMPTS:
            await asyncio.sleep(JINA_RETRY_PAUSE_SECONDS * attempt)
    return ""


# ── exa_search channel: discovery via mcporter ────────────────────

def _mcporter_available() -> bool:
    return shutil.which("mcporter") is not None


def _exa_search_blocking(query: str, num_results: int) -> str:
    """Run one Exa search through mcporter; returns raw stdout (or '')."""
    try:
        import subprocess
        result = subprocess.run(
            [
                "mcporter", "call", "exa.web_search_exa",
                f"query={query}",
                f"numResults={num_results}",
                "--timeout", str(_MCPORTER_TIMEOUT_SECONDS * 1000),
            ],
            capture_output=True,
            text=True,
            timeout=_MCPORTER_TIMEOUT_SECONDS,
        )
        return result.stdout or ""
    except Exception as exc:
        logger.info("exa search failed (%s): %s", type(exc).__name__, str(exc)[:120])
        return ""


async def exa_discover_post_urls(keyword: str, num_results: int = 10) -> List[str]:
    """Discover public LinkedIn post URLs via agent-reach's exa_search channel.

    Returns [] when mcporter/Exa is not installed — callers fall back to
    Google/DDG. Results include page snippets, so URL extraction is the same
    regex used for the other engines.
    """
    if not _mcporter_available():
        return []

    from .scrapling_provider import extract_post_urls  # shared URL regex

    queries = [
        f"site:linkedin.com/posts/ {keyword}",
        f"site:linkedin.com/pulse/ {keyword}",
    ]
    urls: List[str] = []
    loop = asyncio.get_running_loop()
    for q in queries:
        try:
            out = await asyncio.wait_for(
                loop.run_in_executor(None, _exa_search_blocking, q, num_results),
                timeout=_MCPORTER_TIMEOUT_SECONDS + 15,
            )
            urls.extend(extract_post_urls(out))
            if len({u.rstrip("/") for u in urls}) >= num_results:
                break
        except Exception as exc:
            logger.info("exa discovery failed for %r: %s", q[:50], exc)

    logger.info("exa discovery: %d urls for keyword=%r", len(urls), keyword)
    return urls
