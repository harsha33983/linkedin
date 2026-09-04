import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, NotFoundError } from "@/lib/errors/api-errors";
import { z } from "zod";

const rejectSchema = z.object({
  reason: z.enum([
    "wrong_tone",
    "not_my_experience",
    "too_generic",
    "wrong_format",
    "other",
  ]),
});

/**
 * POST /api/generation/[id]/reject — Record rejection reason
 *
 * PRD §8.4: Lightweight, non-blocking, dismissible.
 * Never gated behind payment (§19).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const { id } = params;
    const body = await request.json();
    const { reason } = rejectSchema.parse(body);

    // Verify ownership
    const [generation] = await sql`SELECT id FROM generations WHERE id = ${id} AND "userId" = ${userId} LIMIT 1`;

    if (!generation) {
      throw new NotFoundError("Generation", id);
    }

    await sql`
      UPDATE generations SET "rejectionReason" = ${reason}, "rejectedAt" = CURRENT_TIMESTAMP WHERE id = ${id}
    `;

    return Response.json({
      success: true,
      message: "Feedback recorded. This helps us learn your voice.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
