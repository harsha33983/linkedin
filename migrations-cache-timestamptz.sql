-- Cache-freshness timestamps must be timezone-independent.
-- The scraper_cache freshness check compares fetchedAt/expiresAt against
-- Date.now(); naive TIMESTAMP columns get rendered in the DB session's
-- timezone, which breaks the comparison. timestamptz stores absolute
-- instants — safe regardless of session TimeZone.
-- Idempotent: safe to re-run.

ALTER TABLE "scraper_cache" ALTER COLUMN "fetchedAt" TYPE timestamptz;
ALTER TABLE "scraper_cache" ALTER COLUMN "expiresAt" TYPE timestamptz;

ALTER TABLE "viral_posts" ALTER COLUMN "fetchedAt" TYPE timestamptz;
ALTER TABLE "viral_posts" ALTER COLUMN "createdAt" TYPE timestamptz;
ALTER TABLE "viral_posts" ALTER COLUMN "updatedAt" TYPE timestamptz;
