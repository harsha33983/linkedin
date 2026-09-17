"""
Mock provider — deterministic realistic LinkedIn-style posts.

Activated with SCRAPER_MODE=mock. Makes ZERO external requests so the full
UI + AI originality pipeline can be developed and tested without LinkedIn
access, without an LLM, and without burning scraping budget.
"""

import hashlib
import random
from datetime import datetime, timedelta, timezone
from typing import List

from ..schemas import ScrapedPost

# Topic-keyed sample content pools (generic, original text written for tests).
CONTENT_POOLS = {
    "ai": [
        "We replaced our onboarding docs with an AI assistant. Support tickets dropped faster than anyone predicted. Here is the honest breakdown of what worked.",
        "Everyone is adding AI features. Almost nobody is asking users first. After 6 months of shipping, I finally understand why discovery matters more than the model.",
        "I asked our AI to review 1,000 support conversations. The top insight had nothing to do with the product — it was about response time expectations.",
    ],
    "saas": [
        "Our churn went down 40% in one quarter. Not because of a new feature — we simply asked canceling users one better question.",
        "Pricing pages are conversations, not tables. We tested three structures and the winner surprised us completely.",
        "The best SaaS onboarding advice I ever got: show value before asking for a single preference setting.",
    ],
    "marketing": [
        "We stopped publishing daily and started publishing meaningfully. Traffic dropped for 3 weeks, then quadrupled. Here is the timeline.",
        "Cold outreach in 2026: 200 personalized messages beat 5,000 templates. Our reply rates prove it every single month.",
        "Your landing page headline is doing 80% of the work. Here are the 5 patterns we keep coming back to.",
    ],
    "career": [
        "I turned down a promotion last year. It was the single best career decision I have made, and here is the reasoning nobody shares.",
        "Rejection taught me more in 3 months than 3 years of comfortable employment. A story for everyone between roles right now.",
        "The interview question that changed how I hire: instead of asking about weaknesses, ask what they rebuilt from scratch.",
    ],
    "startups": [
        "We almost ran out of money twice this year. Both times, talking to customers — not investors — saved us.",
        "Co-founder conflict is a feature, not a bug, until it is not. Here are the three warning signs we missed.",
        "We killed our most-requested feature last month. Support volume halved and activation went up. product strategy in one anecdote.",
    ],
    "default": [
        "Consistency beats intensity in everything I have tried professionally. This is the system that finally made it stick for me.",
        "The most underrated professional skill: writing clearly under time pressure. Here is how I practice it weekly.",
        "I spent a year saying yes to everything. Then I tracked my calendar for a month and the data changed my mind completely.",
    ],
}

AUTHORS = [
    ("Priya Raman", "Founder @ Northbeam Labs", "LinkedIn voice on product-led growth"),
    ("Marcus Webb", "Engineering Manager", "Writing about scaling engineering teams"),
    ("Aisha Bello", "Head of Growth", "B2B growth experiments, documented weekly"),
    ("Daniel Kowalski", "Career Coach", "Helping professionals navigate career pivots"),
    ("Elena Suárez", "Fractional CMO", "Marketing systems for B2B SaaS"),
    ("Tom Okafor", "ML Engineer", "Applied AI in production systems"),
    ("Sara Lindqvist", "Product Designer", "Design systems and UX strategy"),
    ("James Carter", "Startup Advisor", "Ex-CTO, now mentoring seed founders"),
]

# Deterministic pseudo-random from keyword so the same keyword yields the
# same dataset (stable tests, stable UI screenshots).


def _seeded(keyword: str, count: int) -> List[ScrapedPost]:
    digest = hashlib.sha256(keyword.lower().encode()).digest()
    rng = random.Random(digest)
    key = keyword.lower()
    pool_key = next((k for k in CONTENT_POOLS if k in key), "default")
    pool = CONTENT_POOLS[pool_key]

    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)  # fixed epoch for determinism
    posts: List[ScrapedPost] = []
    for i in range(count):
        name, headline, author_line = AUTHORS[(i + rng.randint(0, 3)) % len(AUTHORS)]
        slug = f"{name.lower().replace(' ', '-')}-{digest.hex()[:8]}{i}"
        reactions = rng.choice([120, 340, 850, 1500, 2300, 4100, 6800, 9400])
        comments = int(reactions * rng.uniform(0.03, 0.22))
        reposts = int(reactions * rng.uniform(0.01, 0.12))
        content = pool[i % len(pool)]
        days_ago = rng.randint(1, 13)
        published = now - timedelta(days=days_ago, hours=rng.randint(0, 20))
        tags = [f"#{pool_key.capitalize()}", "#Growth", "#LessonsLearned"][: rng.randint(2, 3)]
        posts.append(
            ScrapedPost(
                sourceUrl=f"https://www.linkedin.com/posts/{slug}",
                postId=f"urn:li:mock:{digest.hex()[:12]}-{i}",
                author={
                    "name": name,
                    "headline": headline,
                    "profileUrl": f"https://www.linkedin.com/in/{slug}",
                    "avatarUrl": None,
                },
                content=content,
                publishedAt=published.isoformat(),
                reactions=reactions,
                comments=comments,
                reposts=reposts,
                mediaUrl=None,
                mediaType=None,
                hashtags=tags,
                topics=[pool_key],
            )
        )
    return posts


def mock_search(keyword: str, days: int, limit: int) -> list[dict]:
    """Return mock posts as plain dicts (provider-agnostic shape)."""
    posts = _seeded(keyword, min(limit, 30))
    return [p.model_dump() for p in posts]
