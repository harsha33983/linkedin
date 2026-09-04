import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { z } from "zod";

const rateSchema = z.object({
  rating: z.enum(["yes", "somewhat", "no"]),
  dimensionOverrides: z
    .object({
      tone: z.array(z.string()).optional(),
      sentenceStyle: z.string().optional(),
      paragraphStyle: z.string().optional(),
      hookPatterns: z.array(z.string()).optional(),
      ctaStyle: z.string().optional(),
      emojiUsage: z.string().optional(),
    })
    .optional(),
});

/**
 * POST /api/voice/rate — Rate Voice DNA satisfaction
 *
 * PRD §5.2: "Does this sound like you? Yes / Somewhat / No"
 * If "No" → accept dimension overrides to improve
 * If "Yes" → set userConfirmed = true
 * Never gated behind payment (§19).
 */
export async function POST(request: Request) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const { rating, dimensionOverrides } = rateSchema.parse(body);

    // If rating is "yes", confirm the Voice DNA
    if (rating === "yes") {
      await sql`
        UPDATE voice_profiles SET "userConfirmed" = true WHERE "userId" = ${userId}
      `;

      return Response.json({
        success: true,
        data: {
          rating,
          message: "Your Voice DNA is confirmed. Output will be tailored to your voice.",
        },
      });
    }

    // If "somewhat" or "no" with overrides, apply them
    if (dimensionOverrides && Object.keys(dimensionOverrides).length > 0) {
      const [current] = await sql`SELECT * FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1`;
      if (current) {
        // Save version before override
        const [maxVersion] = await sql`
          SELECT version FROM voice_profile_versions WHERE "userId" = ${userId} ORDER BY version DESC LIMIT 1
        `;
        const snapshotVersion = (maxVersion?.version || 0) + 1;

        await sql`
          INSERT INTO voice_profile_versions (
            id, "userId", version, snapshot, "triggerReason", "createdAt"
          ) VALUES (
            gen_random_uuid(), ${userId}, ${snapshotVersion}, 
            ${JSON.stringify({
              tone: current.tone,
              sentenceStyle: current.sentenceStyle,
              paragraphStyle: current.paragraphStyle,
              hookPatterns: current.hookPatterns,
              ctaStyle: current.ctaStyle,
              emojiUsage: current.emojiUsage,
              commonTopics: current.commonTopics,
              wordsToAvoid: current.wordsToAvoid,
              writingPatterns: current.writingPatterns,
              confidenceScore: current.confidenceScore,
              sampleCount: current.sampleCount,
              userConfirmed: current.userConfirmed,
            })}::jsonb, 
            'slider_update', CURRENT_TIMESTAMP
          )
        `;

        // Apply overrides
        // Apply overrides
        await sql`
          UPDATE voice_profiles SET
            tone = COALESCE(${dimensionOverrides.tone ? JSON.stringify(dimensionOverrides.tone) + '::jsonb' : null}, tone),
            "sentenceStyle" = COALESCE(${dimensionOverrides.sentenceStyle || null}, "sentenceStyle"),
            "paragraphStyle" = COALESCE(${dimensionOverrides.paragraphStyle || null}, "paragraphStyle"),
            "hookPatterns" = COALESCE(${dimensionOverrides.hookPatterns ? JSON.stringify(dimensionOverrides.hookPatterns) + '::jsonb' : null}, "hookPatterns"),
            "ctaStyle" = COALESCE(${dimensionOverrides.ctaStyle || null}, "ctaStyle"),
            "emojiUsage" = COALESCE(${dimensionOverrides.emojiUsage || null}, "emojiUsage"),
            version = ${current.version + 1},
            "lastUpdated" = CURRENT_TIMESTAMP
          WHERE "userId" = ${userId}
        `;
      }
    }

    const messages: Record<string, string> = {
      somewhat: "Thanks for the feedback. Your Voice DNA has been adjusted.",
      no: "Thanks for the feedback. Help us improve — adjust the dimensions above.",
    };

    return Response.json({
      success: true,
      data: {
        rating,
        message: messages[rating],
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
