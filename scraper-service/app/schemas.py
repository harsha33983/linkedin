"""
Pydantic schemas for the scraper service.

Every field that may be unavailable is Optional and defaults to None —
the extractor NEVER invents values for data it could not read.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class PostAuthor(BaseModel):
    name: Optional[str] = None
    headline: Optional[str] = None
    profileUrl: Optional[str] = None
    avatarUrl: Optional[str] = None


class ScrapedPost(BaseModel):
    sourceUrl: Optional[str] = None
    postId: Optional[str] = None
    author: Optional[PostAuthor] = None
    content: Optional[str] = None
    publishedAt: Optional[str] = None
    reactions: Optional[int] = None
    comments: Optional[int] = None
    reposts: Optional[int] = None
    mediaUrl: Optional[str] = None
    mediaType: Optional[str] = None
    hashtags: Optional[List[str]] = Field(default_factory=list)
    topics: Optional[List[str]] = Field(default_factory=list)
    # Computed by services/viral_score.py after normalization (not by the LLM).
    viralScore: Optional[float] = None


class SearchRequest(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=120)
    days: int = Field(14, ge=1, le=90)
    limit: int = Field(20, ge=1, le=50)


class SearchResponse(BaseModel):
    posts: List[ScrapedPost]
    status: str = "ok"  # ok | temporarily_unavailable | mock
    mode: str
    found: int = 0
    extracted: int = 0
    failed: int = 0


class RefreshRequest(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=120)
    days: int = Field(14, ge=1, le=90)
    limit: int = Field(20, ge=1, le=50)


class RefreshResponse(BaseModel):
    keyword: str
    found: int = 0
    extracted: int = 0
    new: int = 0
    updated: int = 0
    failed: int = 0
    mode: str


class HealthResponse(BaseModel):
    status: str
    service: str
    scraper: str
    mode: str
    llm: str
