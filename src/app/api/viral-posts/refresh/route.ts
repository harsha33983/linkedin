/**
 * POST /api/viral-posts/refresh — force-refresh a keyword window.
 * Authenticated + rate-limited; scrapes via the internal service and upserts.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { checkRateLimitRedis } from "@/lib/rate-limit/redis-limiter";
import { scrapeSearch } from "@/lib/viral-posts/scraper-client";
import { upsertPosts } from "@/lib/viral-posts/store";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  keyword: z.string().trim().min(1).max(120),
  days: z.coerce.number().int().min(1).max(90).default(14),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request);
    const rl = await checkRateLimitRedis(`viral:refresh:${userId}`, 5, 60_000);
    if (!rl.allowed) {
      return Response.json(
        { success: false, error: "Refresh rate limit reached. Try again in a minute." },
        { status: 429 }
      );
    }

    const { keyword, days, limit } = bodySchema.parse(await request.json());

    const result = await scrapeSearch({ keyword, days, limit });
    let upsert = { inserted: 0, updated: 0, postIds: [] as string[] };
    if (result.posts.length > 0) {
      upsert = await upsertPosts(result.posts, keyword, days);
    }

    return Response.json({
      success: true,
      data: {
        keyword,
        days,
        found: result.found,
        extracted: result.extracted,
        new: upsert.inserted,
        updated: upsert.updated,
        failed: result.failed,
        status: result.status,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
