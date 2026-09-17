import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, NotFoundError } from "@/lib/errors/api-errors";
import { z } from "zod";

const putSchema = z.object({
  generationId: z.string().min(1),
  overrides: z.record(z.any()),
});

/**
 * GET /api/generation/latest — Resume the most recent post generation
 *
 * Returns the latest `type = 'post'` generation (created within the last
 * 24h) so a page refresh or accidental navigation doesn't lose
 * drafts-in-progress. Client-side mutations (content edits, image
 * removals/replacements/uploads) are applied from the row's `overrides`
 * column on top of the stored output.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);

    const [row] = await sql`
      SELECT id, model, "voiceDnaVersionUsed", output, overrides, "createdAt"
      FROM generations
      WHERE "userId" = ${userId} AND type = 'post'
        AND "createdAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - INTERVAL '24 hours')
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;

    if (!row) {
      return Response.json({ success: true, data: null });
    }

    const [voice] = await sql`
      SELECT "confidenceScore" FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1
    `;

    const output = (row as any).output as any;
    const versions = Array.isArray(output?.versions) ? output.versions : [];

    return Response.json({
      success: true,
      data: {
        generationId: (row as any).id,
        versions,
        overrides: (row as any).overrides || {},
        metadata: {
          model: (row as any).model || "local-nlp",
          voiceDnaVersionUsed: (row as any).voiceDnaVersionUsed ?? 0,
          confidenceScore: (voice as any)?.confidenceScore ?? 0.2,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/generation/latest — Persist client-side mutations for a generation
 *
 * Body: { "generationId": "...", "overrides": { "<versionId>": { content, imageUrl, customImageUrl, customChosen } } }
 *
 * `overrides` is a full snapshot per version (idempotent): restore applies it
 * on top of the stored output whenever the page is reopened.
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const { generationId, overrides } = putSchema.parse(body);

    const res = await sql`
      UPDATE generations
      SET overrides = ${JSON.stringify(overrides)}::jsonb
      WHERE id = ${generationId} AND "userId" = ${userId}
      RETURNING id
    `;

    if (res.length === 0) {
      throw new NotFoundError("Generation", generationId);
    }

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}