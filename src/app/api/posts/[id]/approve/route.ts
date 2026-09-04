import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, NotFoundError } from "@/lib/errors/api-errors";

/**
 * POST /api/posts/[id]/approve — Move post to APPROVED state
 *
 * PRD §12: APPROVED is a new status distinct from DRAFT/SCHEDULED.
 * It's the queue state for Approved Queue mode.
 * Auto-publish never touches non-APPROVED content.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireAuthFromRequest(request);
    const { id } = params;

    const [existing] = await sql`SELECT * FROM posts WHERE id = ${id} AND "userId" = ${userId} LIMIT 1`;
    if (!existing) throw new NotFoundError("Post", id);

    if (existing.status === "APPROVED") {
      return Response.json({
        success: true,
        message: "Post is already approved.",
      });
    }

    const [updated] = await sql`
      UPDATE posts SET status = 'APPROVED', "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
    `;

    return Response.json({
      success: true,
      data: updated,
      message: "Post approved and added to the publish queue.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
