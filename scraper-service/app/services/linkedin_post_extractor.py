"""
Single-post extraction service.

Wraps the Scrapling provider's extract_post with normalization so any
caller (future imports, individual URL analysis) gets a normalized post.
"""

from typing import Optional

from ..providers import scrapling_provider as scrapling
from ..schemas import ScrapedPost
from .linkedin_search import _normalize
from .viral_score import calculate_viral_score


async def extract_single_post(url: str) -> Optional[dict]:
    """Extract + normalize + score one public post URL. None if inaccessible."""
    raw = await scrapling.extract_post(url)
    if raw is None:
        return None
    normalized = _normalize(raw, url)
    data = normalized.model_dump()
    data["viralScore"] = calculate_viral_score(data)
    return data
