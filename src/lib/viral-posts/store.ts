/**
 * Viral posts store — Postgres persistence, dedupe, and the CENTRAL CACHE.
 *
 * Cache contract: the scraper is expensive and slow (5-30s), so it is never
 * run in a user's request path once data exists. The API route serves from
 * this Postgres cache and refreshes in the background (stale-while-
 * revalidate, see /api/viral-posts):
 *
 *   - `scraper_cache` tracks a freshness window per keyword:days
 *   - `viral_posts` holds the posts, tagged with the keyword
 *   - freshness timestamps are timestamptz written as explicit JS instants,
 *     so comparisons never depend on the DB session's TimeZone
 */

import { sql } from "@/lib/db";
import { randomUUID } from "crypto";
import { postIdentity, parsePublishedAt, type ViralPost } from "./types";
import { calculateViralScore } from "./viral-score";

const TTL_MINUTES = Number(process.env.SCRAPER_CACHE_TTL_MINUTES || 30);

export function cacheKey(keyword: string, days: number): string {
  return `viral_posts:${keyword.trim().toLowerCase()}:${days}d`;
}

export interface CacheState {
  fresh: boolean;
  fetchedAt: string | null;
  expiresAt: string | null;
  key: string;
}

export async function getCacheState(keyword: string, days: number): Promise<CacheState> {
  const key = cacheKey(keyword, days);
  try {
    const rows = await sql`
      SELECT "fetchedAt", "expiresAt" FROM "scraper_cache" WHERE "key" = ${key} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { fresh: false, fetchedAt: null, expiresAt: null, key };
    return {
      fresh: new Date((row as any).expiresAt).getTime() > Date.now(),
      fetchedAt: (row as any).fetchedAt ? new Date((row as any).fetchedAt).toISOString() : null,
      expiresAt: (row as any).expiresAt ? new Date((row as any).expiresAt).toISOString() : null,
      key,
    };
  } catch (err) {
    console.error("[ViralPosts] getCacheState failed:", String((err as any)?.message || err).slice(0, 200));
    return { fresh: false, fetchedAt: null, expiresAt: null, key };
  }
}

/**
 * Read posts for a keyword window directly from the shared DB cache.
 * Only posts published within the user's selected window are returned —
 * cached rows older than the window are never served.
 */
export async function readCachedPosts(
  keyword: string,
  days: number,
  limit: number,
  reactionsMin: number
): Promise<ViralPost[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  try {
    const rows = await sql`
      SELECT * FROM "viral_posts"
      WHERE "keyword" = ${keyword.trim().toLowerCase()}
        AND ("reactions" IS NULL OR "reactions" >= ${reactionsMin})
        AND ("publishedAt" IS NULL OR "publishedAt" >= ${cutoff.toISOString()}::timestamptz)
      ORDER BY "viralScore" DESC
      LIMIT ${limit}
    `;
    return (rows as any[]).map(rowToPost);
  } catch (err) {
    console.error("[ViralPosts] readCachedPosts failed:", String((err as any)?.message || err).slice(0, 200));
    return [];
  }
}

/**
 * Upsert a batch of scraped posts. Dedupe identity: (source, sourcePostId),
 * with a stable URL-hash fallback. Returns { inserted, updated, postIds }.
 */
export async function upsertPosts(
  posts: ViralPost[],
  keyword: string,
  days: number
): Promise<{ inserted: number; updated: number; postIds: string[] }> {
  let inserted = 0;
  let updated = 0;
  const postIds: string[] = [];
  const kw = keyword.trim().toLowerCase();
  const nowIso = new Date().toISOString();

  for (const post of posts) {
    const { sourcePostId } = postIdentity(post.source, post.sourcePostId, post.sourceUrl);
    const publishedAt = parsePublishedAt(post.publishedAt);
    const viralScore = post.viralScore || calculateViralScore(post);
    try {
      const result = await sql`
        INSERT INTO "viral_posts" (
          "id", "source", "sourcePostId", "sourceUrl",
          "authorName", "authorHeadline", "authorProfileUrl", "authorAvatarUrl",
          "content", "publishedAt",
          "reactions", "comments", "reposts",
          "mediaUrl", "mediaType", "hashtags", "topics",
          "viralScore", "keyword", "fetchedAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${post.source}, ${sourcePostId}, ${post.sourceUrl},
          ${post.author.name}, ${post.author.headline}, ${post.author.profileUrl}, ${post.author.avatarUrl},
          ${post.content}, ${publishedAt},
          ${post.reactions}, ${post.comments}, ${post.reposts},
          ${post.mediaUrl}, ${post.mediaType}, ${post.hashtags}, ${post.topics},
          ${viralScore}, ${kw}, ${nowIso}::timestamptz, ${nowIso}::timestamptz
        )
        ON CONFLICT ("source", "sourcePostId") DO UPDATE SET
          "authorName" = EXCLUDED."authorName",
          "authorHeadline" = EXCLUDED."authorHeadline",
          "authorProfileUrl" = EXCLUDED."authorProfileUrl",
          "authorAvatarUrl" = EXCLUDED."authorAvatarUrl",
          "content" = EXCLUDED."content",
          "publishedAt" = EXCLUDED."publishedAt",
          "reactions" = EXCLUDED."reactions",
          "comments" = EXCLUDED."comments",
          "reposts" = EXCLUDED."reposts",
          "mediaUrl" = EXCLUDED."mediaUrl",
          "mediaType" = EXCLUDED."mediaType",
          "hashtags" = EXCLUDED."hashtags",
          "topics" = EXCLUDED."topics",
          "viralScore" = EXCLUDED."viralScore",
          "keyword" = EXCLUDED."keyword",
          "fetchedAt" = ${nowIso}::timestamptz,
          "updatedAt" = ${nowIso}::timestamptz
        RETURNING (xmax = 0) AS inserted, "id"
      `;
      if ((result[0] as any)?.inserted) inserted += 1;
      else updated += 1;
      if (sourcePostId) postIds.push(sourcePostId);
    } catch (err: any) {
      console.error("[ViralPosts] upsert failed:", String(err?.message || err).slice(0, 160));
    }
  }

  // Record the central-cache window for this keyword.
  const key = cacheKey(keyword, days);
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000);
  try {
    await sql`
      INSERT INTO "scraper_cache" ("key", "keyword", "days", "postIds", "fetchedAt", "expiresAt", "status")
      VALUES (${key}, ${kw}, ${days}, ${postIds}, ${nowIso}::timestamptz, ${expiresAt.toISOString()}::timestamptz, 'ok')
      ON CONFLICT ("key") DO UPDATE SET
        "postIds" = EXCLUDED."postIds",
        "fetchedAt" = EXCLUDED."fetchedAt",
        "expiresAt" = EXCLUDED."expiresAt",
        "status" = 'ok'
    `;
  } catch (err: any) {
    console.error("[ViralPosts] cache state write failed:", String(err?.message || err).slice(0, 160));
  }

  return { inserted, updated, postIds };
}

function rowToPost(r: any): ViralPost {
  return {
    id: r.id,
    source: r.source,
    sourcePostId: r.sourcePostId,
    sourceUrl: r.sourceUrl,
    author: {
      name: r.authorName ?? null,
      headline: r.authorHeadline ?? null,
      profileUrl: r.authorProfileUrl ?? null,
      avatarUrl: r.authorAvatarUrl ?? null,
    },
    content: r.content ?? null,
    publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
    reactions: r.reactions ?? null,
    comments: r.comments ?? null,
    reposts: r.reposts ?? null,
    mediaUrl: r.mediaUrl ?? null,
    mediaType: r.mediaType ?? null,
    hashtags: r.hashtags ?? [],
    topics: r.topics ?? [],
    viralScore: Number(r.viralScore) || 0,
    keyword: r.keyword ?? null,
    fetchedAt: r.fetchedAt ? new Date(r.fetchedAt).toISOString() : null,
  };
}

export { rowToPost };
