/**
 * POST /api/content-ideas/generate
 *
 * Body: { postId } (a viral_posts row) or { sourceContent, sourceUrl }.
 * Flow: load post → build user context (getUserContentContext) → analyze the
 * post's patterns (AI with deterministic fallback) → generate 5 ORIGINAL
 * ideas under the strict anti-copy system prompt → 8-gram overlap guard →
 * return { analysis, ideas, usage }.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { checkRateLimitRedis } from "@/lib/rate-limit/redis-limiter";
import { getUserContentContext } from "@/lib/content-ideas/context";
import { analyzeViralPost, generateOriginalIdeas } from "@/lib/content-ideas/originality";
import { getViralUsage, consumeAiGeneration, resolvePlan } from "@/lib/viral-posts/usage";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    postId: z.string().uuid().optional(),
    sourceUrl: z.string().url().max(500).optional(),
    sourceContent: z.string().max(20_000).optional(),
  })
  .refine((b) => b.postId || b.sourceUrl, { message: "postId or sourceUrl required" });

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request);
    const plan = await resolvePlan(userId);

    const rl = await checkRateLimitRedis(`viral:ideas:${userId}`, 10, 60_000);
    if (!rl.allowed) {
      return Response.json(
        { success: false, error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    // Plan-aware AI quota (reuses existing subscription config).
    const canGenerate = await consumeAiGeneration(userId, plan);
    if (!canGenerate) {
      const usage = await getViralUsage(userId, plan);
      return Response.json(
        {
          success: false,
          error: `Daily AI idea-generation limit reached (${usage.aiGenerationsLimit}/day on the ${plan} plan). Upgrade for more.`,
          code: "PLAN_LIMIT",
          usage,
        },
        { status: 429 }
      );
    }

    const body = bodySchema.parse(await request.json());

    let content: string | null = null;
    let sourceUrl: string | null = null;
    let reactions: number | null = null;
    let comments: number | null = null;
    let viralScore = 0;

    if (body.postId) {
      const [row] = await sql`
        SELECT "sourceUrl", "content", "reactions", "comments", "viralScore"
        FROM "viral_posts" WHERE "id" = ${body.postId} LIMIT 1
      `;
      if (!row) {
        return Response.json({ success: false, error: "Post not found" }, { status: 404 });
      }
      content = (row as any).content;
      sourceUrl = (row as any).sourceUrl;
      reactions = (row as any).reactions;
      comments = (row as any).comments;
      viralScore = Number((row as any).viralScore) || 0;
    } else {
      content = body.sourceContent ?? null;
      sourceUrl = body.sourceUrl ?? null;
    }

    const ctx = await getUserContentContext(userId);

    const { analysis, usedAi, model } = await analyzeViralPost(
      { content, reactions, comments, viralScore },
      ctx
    );
    const { ideas, usedAi: ideasUsedAi, model: ideasModel } = await generateOriginalIdeas(
      analysis,
      ctx,
      { content }
    );

    // Audit trail (no post content in the log — just ids and counts).
    await sql`
      INSERT INTO "generations" ("id", "userId", "type", "input", "output", "model")
      VALUES (
        ${randomUUID()}, ${userId}, 'idea',
        ${JSON.stringify({ postId: body.postId || null, sourceUrl, originalityPipeline: true })}::jsonb,
        ${JSON.stringify({ analysis, ideasCount: ideas.length, ideas })}::jsonb,
        ${ideasModel || model}
      )
    `;

    return Response.json({
      success: true,
      data: { analysis, ideas, sourceUrl },
      meta: {
        usedAi: usedAi && ideasUsedAi,
        model: ideasModel || model,
        plan,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
