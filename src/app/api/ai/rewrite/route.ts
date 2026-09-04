import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, ValidationError, AiGenerationError } from "@/lib/errors/api-errors";
import { getProvider } from "@/lib/ai/types";
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
    const body = await request.json();
    const parsed = rewriteSchema.parse(body);

    const [voiceProfile] = await sql`
      SELECT * FROM voice_profiles WHERE "userId" = ${userId}
    `;

    if (!voiceProfile) {
      throw new ValidationError("No Voice DNA found. Please add writing samples first.");
    }

    const provider = getProvider();
    let result;
    try {
      result = await provider.rewriteContent({
        content: parsed.content,
        instructions: parsed.instructions,
        voiceProfile: voiceProfile as any,
      });
    } catch (aiError) {
      console.error("Rewrite failed:", aiError);
      throw new AiGenerationError("Rewrite failed. Please try again.");
    }

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
    });
  } catch (error) {
    return handleApiError(error);
  }
}
