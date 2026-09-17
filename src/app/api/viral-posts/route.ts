/**
 * GET /api/viral-posts
 *
 * Query: keyword, days, reactionsMin, page, limit, sort
 *
 * Flow: auth → validate → hot/DB cache → serve immediately.
 * The scraper NEVER blocks a request once cached rows exist:
 *   - fresh cache → instant serve
 *   - stale cache → instant serve of cached rows + ONE shared background
 *     refresh (single-flight promise) so the next load is fresh
 *   - no rows at all (brand-new keyword) → one blocking scrape, unavoidable
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { checkRateLimitRedis } from "@/lib/rate-limit/redis-limiter";
import { scrapeSearch, scraperMode } from "@/lib/viral-posts/scraper-client";
import { getCacheState, readCachedPosts, upsertPosts } from "@/lib/viral-posts/store";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  keyword: z.string().trim().min(1).max(120).default("AI"),
  days: z.coerce.number().int().min(1).max(90).default(14),
  reactionsMin: z.coerce.number().int().min(0).max(1_000_000).default(0),
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  sort: z.enum(["viral", "recent", "reactions"]).default("viral"),
});

// In-process single-flight: a burst of users with the same stale keyword
// shares ONE background refresh instead of hammering the scraper service.
const inflight = new Map<string, Promise<void>>();

function scheduleRefresh(key: string, keyword: string, days: number): void {
  if (inflight.has(key)) return;
  const task = (async () => {
    const result = await scrapeSearch({ keyword, days, limit: 30 });
    if (result.posts.length > 0) {
      await upsertPosts(result.posts, keyword, days);
    }
  })()
    .catch((err) =>
      console.error(`[ViralPosts] background refresh failed (${key}):`, String(err?.message || err).slice(0, 160))
    )
    .finally(() => inflight.delete(key));
  inflight.set(key, task);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request);

    const rl = await checkRateLimitRedis(`viral:read:${userId}`, 60, 60_000);
    if (!rl.allowed) {
      return Response.json(
        { success: false, error: "Rate limit exceeded. Please try again shortly." },
        { status: 429 }
      );
    }

    const params = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const { keyword, days, reactionsMin, page, limit, sort } = params;

    const cache = await getCacheState(keyword, days);
    let posts = await readCachedPosts(keyword, days, 200, reactionsMin);

    let status: "ok" | "mock" | "temporarily_unavailable" = "ok";
    let servedStale = false;

    if (posts.length > 0) {
      // Rows exist → serve instantly. If stale, refresh in the background.
      if (!cache.fresh) {
        servedStale = true;
        scheduleRefresh(cache.key, keyword, days);
      }
    } else {
      // No rows at all: brand-new keyword or the service was down. One
      // blocking scrape is unavoidable on this path; concurrent callers
      // dedupe onto the same promise.
      const existing = inflight.get(cache.key);
      if (existing) {
        await existing;
      } else {
        const task = (async () => {
          const result = await scrapeSearch({ keyword, days, limit: 30 });
          if (result.posts.length > 0) {
            await upsertPosts(result.posts, keyword, days);
          }
          return result.status;
        })();
        const tracked = task.then(() => undefined);
        inflight.set(cache.key, tracked);
        tracked.finally(() => inflight.delete(cache.key));
        status = (await task) as "ok" | "mock" | "temporarily_unavailable";
      }
      posts = await readCachedPosts(keyword, days, 200, reactionsMin);
      // No banner for a legit empty result — the scraper service already
      // reports temporarily_unavailable only when discovery itself failed
      // (search engines blocking us), which is the true outage case.
    }

    // Sort: OUR viral score (default), recency, or raw reactions.
    if (sort === "recent") {
      posts.sort(
        (a, b) =>
          new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
      );
    } else if (sort === "reactions") {
      posts.sort((a, b) => (b.reactions ?? 0) - (a.reactions ?? 0));
    } else {
      posts.sort((a, b) => b.viralScore - a.viralScore);
    }

    const total = posts.length;
    const start = (page - 1) * limit;
    const pagePosts = posts.slice(start, start + limit);

    // Report the post-refresh state if a background job just landed.
    const latestState = servedStale ? await getCacheState(keyword, days) : cache;

    return Response.json({
      success: true,
      data: pagePosts,
      total,
      page,
      pageSize: limit,
      status,
      mode: scraperMode(),
      cache: {
        fetchedAt: latestState.fetchedAt,
        expiresAt: latestState.expiresAt,
        staleServed: servedStale,
      },
      product: "Trending LinkedIn Posts",
      notice:
        status === "temporarily_unavailable"
          ? "Live trending data is temporarily unavailable. Showing cached results when available."
          : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
