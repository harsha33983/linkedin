"""
Viral score — deterministic 0–100 ranking of a post's performance.

Not reaction-count-only: blends total engagement, comment depth, share ratio,
comment-to-reaction ratio (discussion quality), recency, and freshness.
The SAME formula runs in the Python service and in Next.js
(src/lib/viral-posts/viral-score.ts) so cached rows and live results agree.
"""

import math
from datetime import datetime, timezone


def _log_scale(value: float, cap: float) -> float:
    """Map a count onto 0–1 with logarithmic compression."""
    if value <= 0:
        return 0.0
    return min(1.0, math.log10(1 + value) / math.log10(1 + cap))


def calculate_viral_score(post: dict) -> float:
    """
    post: normalized dict with reactions, comments, reposts, publishedAt.
    Returns 0–100 (one decimal).
    """
    reactions = max(0, int(post.get("reactions") or 0))
    comments = max(0, int(post.get("comments") or 0))
    reposts = max(0, int(post.get("reposts") or 0))
    published_at = post.get("publishedAt")

    total = reactions + comments * 2 + reposts * 3  # shares are the strongest signal
    engagement = _log_scale(total, 50_000)          # 50k+ total engagement → 1.0
    depth = _log_scale(comments, 500)               # discussion depth
    share_ratio = _log_scale(reposts, 1_000)

    # Comment-to-reaction ratio: quality signal, capped at 0.3 (above that it
    # usually means reaction-bait or a heated thread, not sustainable virality).
    c2r = comments / reactions if reactions > 0 else 0.0
    discussion = min(1.0, c2r / 0.3)

    age_days = 30.0
    if published_at:
        try:
            if isinstance(published_at, str):
                dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
            elif isinstance(published_at, datetime):
                dt = published_at
            else:
                dt = None
            if dt is not None:
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                age_days = max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 86400)
        except Exception:
            pass

    # Recency: 7-day half-life, floor of 0.25 so old-but-massive posts still
    # rank. With zero engagement the score stays 0 — freshness alone is not
    # virality.
    if total == 0:
        return 0.0
    recency = max(0.25, 2 ** (-age_days / 7))
    freshness = max(0.0, 1.0 - min(1.0, age_days / 90))

    score = (
        engagement * 45.0
        + depth * 15.0
        + share_ratio * 10.0
        + discussion * 10.0
        + recency * 12.0
        + freshness * 8.0
    )
    return round(max(0.0, min(100.0, score)), 1)
