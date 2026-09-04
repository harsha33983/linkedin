import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, ValidationError, AiGenerationError } from "@/lib/errors/api-errors";
import { getProvider } from "@/lib/ai/types";
import { z } from "zod";

const generateHooksSchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  targetAudience: z.string().optional(),
  hookType: z.string().optional(), // "Contrarian", "All", etc.
});

/**
 * POST /api/ai/generate-hooks — Generate hooks with structural + voice-fit scoring
 *
 * Scoring (§8.5):
 * - Structural score (0-100): clarity + specificity + curiosity gap + pattern-interrupt
 * - Voice-fit score (0-100): matches user's Voice DNA hook patterns
 * - NEVER claims predictive performance
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const parsed = generateHooksSchema.parse(body);

    // Retrieve VoiceDNA
    const [voiceProfile] = await sql`
      SELECT * FROM voice_profiles WHERE "userId" = ${userId}
    `;

    if (!voiceProfile) {
      throw new ValidationError("No Voice DNA found. Please add writing samples first.");
    }

    // Get recent hooks for novelty check
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

    // Generate hooks
    const provider = getProvider();
    let result;
    try {
      result = await provider.generateHooks({
        topic: parsed.topic,
        targetAudience: parsed.targetAudience,
        hookType: parsed.hookType,
        voiceProfile: voiceProfile as any,
      });
    } catch (aiError) {
      console.error("Hook generation failed:", aiError);
      throw new AiGenerationError("Hook generation failed. Please try again.");
    }

    // Store generation record
    await sql`
      INSERT INTO generations (
        id, "userId", type, input, output, model, "voiceDnaVersionUsed"
      ) VALUES (
        gen_random_uuid(), ${userId}, 'hook', ${JSON.stringify(parsed)}::jsonb, ${JSON.stringify(result)}::jsonb, 
        ${process.env.AI_MODEL || "gpt-4o"}, ${(voiceProfile as any).version}
      )
    `;

    return Response.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
