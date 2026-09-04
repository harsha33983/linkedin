import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, NotFoundError } from "@/lib/errors/api-errors";
import { getSourceWeight } from "@/lib/voice/weighting";
import { dispatchVoiceReanalysis } from "@/lib/queue";
import { z } from "zod";

const updateSampleSchema = z.object({
  content: z.string().min(10).optional(),
  source: z.enum(["linkedin_post", "blog", "email", "slack", "other"]).optional(),
  sourceType: z.string().optional(),
});

/**
 * PATCH /api/voice/samples/[id] — Update a writing sample
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const { id } = params;
    const body = await request.json();
    const parsed = updateSampleSchema.parse(body);

    // Verify ownership
    const [existing] = await sql`SELECT * FROM writing_samples WHERE id = ${id} AND "userId" = ${userId} LIMIT 1`;

    if (!existing) {
      throw new NotFoundError("WritingSample", id);
    }

    const updateData: Record<string, unknown> = { ...parsed };

    // Recompute weight if source changed
    if (parsed.source) {
      updateData.weight = getSourceWeight(parsed.source);
    }

    const [updated] = await sql`
      UPDATE writing_samples SET
        content = COALESCE(${updateData.content || null}, content),
        source = COALESCE(${updateData.source || null}, source),
        "sourceType" = COALESCE(${updateData.sourceType || null}, "sourceType"),
        weight = COALESCE(${updateData.weight || null}, weight),
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    // Trigger reanalysis on content change
    if (parsed.content) {
      dispatchVoiceReanalysis({
        userId,
        triggerReason: "user_edit",
      });
    }

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/voice/samples/[id] — Delete a writing sample
 *
 * Deleting a sample triggers automatic reanalysis (PRD §8.3).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireAuthFromRequest(request);
    const { id } = params;

    // Verify ownership
    const [existing] = await sql`SELECT * FROM writing_samples WHERE id = ${id} AND "userId" = ${userId} LIMIT 1`;

    if (!existing) {
      throw new NotFoundError("WritingSample", id);
    }

    await sql`DELETE FROM writing_samples WHERE id = ${id}`;

    // Trigger reanalysis after deletion
    const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM writing_samples WHERE "userId" = ${userId}`;
    const remainingCount = count;

    if (remainingCount >= 3) {
      dispatchVoiceReanalysis({
        userId,
        triggerReason: "sample_deleted",
      });
    }

    return Response.json({
      success: true,
      message: "Sample deleted. Voice DNA will be reanalyzed.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
