-- Viral Posts feature tables.
-- Run once against the production Neon database (psql or Neon SQL editor).
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "viral_posts" (
  "id" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL,
  "sourcePostId" TEXT,
  "sourceUrl" TEXT NOT NULL,
  "authorName" TEXT,
  "authorHeadline" TEXT,
  "authorProfileUrl" TEXT,
  "authorAvatarUrl" TEXT,
  "content" TEXT,
  "publishedAt" TIMESTAMP(3),
  "reactions" INTEGER,
  "comments" INTEGER,
  "reposts" INTEGER,
  "mediaUrl" TEXT,
  "mediaType" TEXT,
  "hashtags" TEXT[],
  "topics" TEXT[],
  "viralScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "keyword" TEXT,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "viral_posts_source_post_id_key"
  ON "viral_posts" ("source", "sourcePostId");
CREATE INDEX IF NOT EXISTS "viral_posts_viral_score_idx" ON "viral_posts" ("viralScore" DESC);
CREATE INDEX IF NOT EXISTS "viral_posts_keyword_idx" ON "viral_posts" ("keyword");
CREATE INDEX IF NOT EXISTS "viral_posts_published_at_idx" ON "viral_posts" ("publishedAt" DESC);

-- Central cache tracking fresh/stale keywords (shared across all users).
CREATE TABLE IF NOT EXISTS "scraper_cache" (
  "key" TEXT PRIMARY KEY,
  "keyword" TEXT NOT NULL,
  "days" INTEGER NOT NULL,
  "postIds" TEXT[],
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ok'
);

-- Backfill for content_ideas.usedAt (added by the ideas-consumption feature).
ALTER TABLE "content_ideas" ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP(3);

-- posts.errorMessage is used by the Job Monitor (added earlier; kept idempotent).
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
