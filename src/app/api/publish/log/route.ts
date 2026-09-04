import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";

/**
 * GET /api/publish/log — Get publish history
 *
 * PRD §8.9: Every auto-published post is logged with a permanent record
 * of what was posted, when, and who approved it.
 */
export async function GET(request: any) {
  try {
    const userId = await requireAuthFromRequest(request as any);

    const logs = await sql`
      SELECT l.*, row_to_json(p) as post 
      FROM publish_logs l
      LEFT JOIN (
        SELECT id, title, content, status FROM posts
      ) p ON l."postId" = p.id
      WHERE l."userId" = ${userId}
      ORDER BY l."publishedAt" DESC
    `;

    return Response.json({
      success: true,
      data: logs,
      total: logs.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
