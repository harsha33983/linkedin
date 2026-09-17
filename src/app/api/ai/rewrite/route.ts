import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, ValidationError, AiGenerationError } from "@/lib/errors/api-errors";
import { withFailover } from "@/lib/ai/types";
import { routeGenerate } from "@/lib/ai/llm-router";
import { getProviderByName } from "@/lib/ai/provider-registry";
import { checkRateLimitRedis } from "@/lib/rate-limit/redis-limiter";
import { z } from "zod";

const rewriteSchema = z.object({
  content: z.string().min(1, "Content is required"),
  instructions: z.string().min(1, "Rewrite instructions are required"),
});

/**
 * POST /api/ai/rewrite — Rewrite existing content with Voice DNA
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const rl = await checkRateLimitRedis(`ai:rewrite:${userId}`, 40, 60 * 60 * 1000);
    if (!rl.allowed) {
      return Response.json({ success: false, error: "Rate limit exceeded. Please try again later.", resetAt: rl.resetAt }, { status: 429 });
    }
    const body = await request.json();
    const parsed = rewriteSchema.parse(body);

    const [voiceProfile] = await sql`
      SELECT * FROM voice_profiles WHERE "userId" = ${userId}
    `;

    if (!voiceProfile) {
      throw new ValidationError("No Voice DNA found. Please add writing samples first.");
    }    // Rewrite — routed through the LLM router (MEDIUM complexity → cheap
    // provider first, Groq second, bounded retry/backoff, generation log).
    const { result, provider: usedProvider, fallbackUsed } = await routeGenerate({
      taskType: "REWRITE",
      routeName: "rewrite",
      userId,
      inputSize: parsed.content.length,
      isUsable: (r: any) => r && (typeof r.rewritten === "string" || typeof r.content === "string"),
      op: (providerName: string) => {
        const provider = getProviderByName(providerName);
        if (!provider) throw new Error(`Provider ${providerName} unavailable`);
        return provider.rewriteContent({
          content: parsed.content,
          instructions: parsed.instructions,
          voiceProfile: voiceProfile as any,
        });
      },
    });

    // Store generation record
    await sql`
      INSERT INTO generations (
        id, "userId", type, input, output, model, "voiceDnaVersionUsed"
      ) VALUES (
        gen_random_uuid(), ${userId}, 'rewrite', ${JSON.stringify(parsed)}::jsonb, 
        ${JSON.stringify(result)}::jsonb, ${process.env.AI_MODEL || "gpt-4o"}, ${(voiceProfile as any).version}
      )
    `;

    return Response.json({
      success: true,
      data: result,
      meta: { provider: usedProvider, fallbackUsed },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
