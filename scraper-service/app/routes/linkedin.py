"""
Scraper service routes.

POST /scrape/linkedin/search  — discover + extract + score public posts
POST /scrape/linkedin/refresh — same pipeline, returns upsert-ready summary
POST /scrape/linkedin/post    — extract one public post URL
GET  /health                  — liveness/health

Auth: X-Internal-Token must match SCRAPER_INTERNAL_TOKEN. Localhost requests
without the header are accepted for local development only.
"""

import logging
from fastapi import APIRouter, HTTPException, Request

from ..config import settings
from ..providers import mock as mock_provider
from ..providers import scrapling_provider as scrapling
from ..schemas import RefreshRequest, RefreshResponse, SearchRequest, SearchResponse
from ..services.linkedin_post_extractor import extract_single_post
from ..services.linkedin_search import search_linkedin_posts

logger = logging.getLogger("scraper.routes")
router = APIRouter()


def _authorize(request: Request) -> None:
    """Internal-token auth; bare localhost allowed for development."""
    client_host = request.client.host if request.client else ""
    provided = request.headers.get("X-Internal-Token", "")
    if provided and settings.internal_token and provided == settings.internal_token:
        return
    if client_host in ("127.0.0.1", "::1", "testclient"):
        return
    raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/scrape/linkedin/search", response_model=SearchResponse)
async def scrape_search(req: SearchRequest, request: Request):
    _authorize(request)
    logger.info(
        "search started keyword=%r days=%d limit=%d mode=%s",
        req.keyword, req.days, req.limit, settings.mode,
    )
    result = await search_linkedin_posts(req.keyword, req.days, req.limit)
    logger.info(
        "search completed keyword=%r found=%d extracted=%d failed=%d status=%s",
        req.keyword, result.get("found", 0), result.get("extracted", 0),
        result.get("failed", 0), result.get("status"),
    )
    return result


@router.post("/scrape/linkedin/refresh", response_model=RefreshResponse)
async def scrape_refresh(req: RefreshRequest, request: Request):
    _authorize(request)
    result = await search_linkedin_posts(req.keyword, req.days, req.limit)
    return RefreshResponse(
        keyword=req.keyword,
        found=result.get("found", 0),
        extracted=result.get("extracted", 0),
        new=0,
        updated=0,
        failed=result.get("failed", 0),
        mode=settings.mode,
    )


@router.post("/scrape/linkedin/post")
async def scrape_single_post(req: dict, request: Request):
    _authorize(request)
    url = (req or {}).get("url") or ""
    if "linkedin.com" not in url:
        raise HTTPException(status_code=400, detail="A linkedin.com URL is required")
    post = await extract_single_post(url)
    if post is None:
        return {"post": None, "status": "not_publicly_accessible"}
    return {"post": post, "status": "ok"}


@router.post("/dev/mock-seed")
async def dev_mock_seed(req: SearchRequest, request: Request):
    """Direct access to the mock provider (used by Next.js in mock mode)."""
    _authorize(request)
    posts = mock_provider.mock_search(req.keyword, req.days, req.limit)
    return {"posts": posts, "status": "mock", "mode": "mock"}


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "linkedin-scraper",
        "scraper": "scrapling",
        "mode": settings.mode,
        "fetch_mode": settings.fetch_mode,
    }
