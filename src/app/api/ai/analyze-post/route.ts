import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, ValidationError, AiGenerationError } from "@/lib/errors/api-errors";
import { withFailover } from "@/lib/ai/types";
import { checkRateLimitRedis } from "@/lib/rate-limit/redis-limiter";
import { z } from "zod";

const analyzePostSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

/**
 * POST /api/ai/analyze-post — Analyze an existing post for quality and voice-fit
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const rl = await checkRateLimitRedis(`ai:analyze-post:${userId}`, 40, 60 * 60 * 1000);
    if (!rl.allowed) {
      return Response.json({ success: false, error: "Rate limit exceeded. Please try again later.", resetAt: rl.resetAt }, { status: 429 });
    }
    const body = await request.json();
    const parsed = analyzePostSchema.parse(body);

    const [voiceProfile] = await sql`
      SELECT * FROM voice_profiles WHERE "userId" = ${userId}
    `;

    if (!voiceProfile) {
      throw new ValidationError("No Voice DNA found.");
    }

    // Get recent hooks for repetition check
    const recentGenerations = await sql`
      SELECT output FROM generations 
      WHERE "userId" = ${userId} AND type = 'hook'
      ORDER BY "createdAt" DESC
      LIMIT 10
    `;

    const recentHooks = recentGenerations
      .map((g: any) => {
        const output = g.output as any;
        return output?.hooks?.[0]?.text || "";
      })
      .filter(Boolean);

    // Quality check (with provider failover)
    const { result } = await withFailover((provider) =>
      provider.checkQuality(parsed.content, voiceProfile as any, recentHooks)
    );

    return Response.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
