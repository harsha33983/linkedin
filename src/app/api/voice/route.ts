import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, NotFoundError } from "@/lib/errors/api-errors";
import { z } from "zod";

/**
 * Report what can be auto-imported as writing samples for Voice DNA:
 * the user's posts published through this app (any status with content),
 * and/or a live LinkedIn connection that can pull their feed posts.
 */
async function getAutoImportMeta(userId: string) {
  const [liConnection] = await sql`
    SELECT id FROM social_accounts 
    WHERE "userId" = ${userId} AND provider = 'LINKEDIN' AND status = 'CONNECTED'
    LIMIT 1
  `;
  const [{ publishedPosts }] = (await sql`
    SELECT COUNT(*)::int AS "publishedPosts" FROM posts 
    WHERE "userId" = ${userId}
    AND content IS NOT NULL AND length(content) > 20
  `) as Array<{ publishedPosts: number }>;

  return {
    available: Boolean(liConnection) || (publishedPosts || 0) > 0,
    hasLinkedIn: Boolean(liConnection),
    publishedPosts: publishedPosts || 0,
  };
}

const updateVoiceProfileSchema = z.object({
  tone: z.array(z.string()).optional(),
  sentenceStyle: z.enum(["short", "short-medium", "medium", "long"]).optional(),
  paragraphStyle: z.enum(["short", "medium", "long"]).optional(),
  hookPatterns: z.array(z.string()).optional(),
  ctaStyle: z.enum(["question", "statement", "soft-cta", "none"]).optional(),
  emojiUsage: z.enum(["none", "low", "moderate", "high"]).optional(),
  commonTopics: z.array(z.string()).optional(),
  wordsToAvoid: z.array(z.string()).optional(),
  writingPatterns: z.record(z.unknown()).optional(),
  sourceWeighting: z.record(z.number()).optional(),
});

/**
 * GET /api/voice — Get current Voice DNA profile
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);

    const [voiceProfile] = await sql`SELECT * FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1`;

    // Get sample count
    const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM writing_samples WHERE "userId" = ${userId}`;
    const sampleCount = count;

    const meta: Record<string, unknown> = { autoImport: await getAutoImportMeta(userId) };

    if (!voiceProfile) {
      return Response.json(
        {
          success: true,
          data: null,
          message: "No Voice DNA yet. Add writing samples to get started.",
          meta,
        },
        { status: 200 }
      );
    }

    return Response.json({
      success: true,
      data: {
        ...voiceProfile,
        sampleCount,
        tone: voiceProfile.tone,
        hookPatterns: voiceProfile.hookPatterns,
        commonTopics: voiceProfile.commonTopics,
        writingPatterns: voiceProfile.writingPatterns,
      },
      meta,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/voice — Manually update Voice DNA dimensions
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const parsed = updateVoiceProfileSchema.parse(body);

    // Snapshot current version before editing
    const [current] = await sql`SELECT * FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1`;

    if (current) {
      // Save version snapshot
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
          'user_edit', CURRENT_TIMESTAMP
        )
      `;

      // Update profile
      const [updated] = await sql`
        UPDATE voice_profiles SET
          tone = COALESCE(${parsed.tone ? JSON.stringify(parsed.tone) + '::jsonb' : null}, tone),
          "sentenceStyle" = COALESCE(${parsed.sentenceStyle || null}, "sentenceStyle"),
          "paragraphStyle" = COALESCE(${parsed.paragraphStyle || null}, "paragraphStyle"),
          "hookPatterns" = COALESCE(${parsed.hookPatterns ? JSON.stringify(parsed.hookPatterns) + '::jsonb' : null}, "hookPatterns"),
          "ctaStyle" = COALESCE(${parsed.ctaStyle || null}, "ctaStyle"),
          "emojiUsage" = COALESCE(${parsed.emojiUsage || null}, "emojiUsage"),
          "commonTopics" = COALESCE(${parsed.commonTopics ? JSON.stringify(parsed.commonTopics) + '::jsonb' : null}, "commonTopics"),
          "wordsToAvoid" = COALESCE(${parsed.wordsToAvoid ? JSON.stringify(parsed.wordsToAvoid) + '::jsonb' : null}, "wordsToAvoid"),
          "writingPatterns" = COALESCE(${parsed.writingPatterns ? JSON.stringify(parsed.writingPatterns) + '::jsonb' : null}, "writingPatterns"),
          "sourceWeighting" = COALESCE(${parsed.sourceWeighting ? JSON.stringify(parsed.sourceWeighting) + '::jsonb' : null}, "sourceWeighting"),
          version = ${current.version + 1},
          "lastUpdated" = CURRENT_TIMESTAMP
        WHERE "userId" = ${userId}
        RETURNING *
      `;

      return Response.json({ success: true, data: updated });
    }

    throw new NotFoundError("VoiceProfile");
  } catch (error) {
    return handleApiError(error);
  }
}
