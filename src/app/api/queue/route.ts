/**
 * GET /api/queue — List posts in content queue (sorted by queuePosition)
 * POST /api/queue — Add post to queue (set status to READY, assign queue position)
 */

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthFromRequest(request);

    // posts timestamps are naive `timestamp without time zone` columns storing
    // UTC wall-clock. Format them as explicit UTC ISO strings (…Z) so clients
    // parse the same instant regardless of the DB session timezone.
    const posts = await sql`
      SELECT 
        id, title, content, topic, format, status, "queuePosition", 
        to_char(("scheduledAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "scheduledAt",
        to_char(("scheduledAtUTC" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "scheduledAtUTC",
        "scheduledTimezone",
        to_char(("publishedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "publishedAt",
        "externalPostId",
        to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
        "imageUrl" 
      FROM posts 
      WHERE "userId" = ${userId} 
      AND status IN ('READY', 'SCHEDULED', 'PUBLISHING', 'FAILED')
      ORDER BY "queuePosition" ASC NULLS LAST, "createdAt" ASC
    `;

    return Response.json({ success: true, data: posts, total: posts.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request);
    const body = await request.json();

    const { postId } = body as { postId: string };
    if (!postId) {
      return Response.json(
        { success: false, error: "postId is required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const [post] = await sql`SELECT * FROM posts WHERE id = ${postId} AND "userId" = ${userId} LIMIT 1`;

    if (!post) {
      return Response.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    // Get next queue position
    const [maxPosition] = await sql`
      SELECT "queuePosition" FROM posts 
      WHERE "userId" = ${userId} AND status IN ('READY', 'SCHEDULED')
      ORDER BY "queuePosition" DESC LIMIT 1
    `;

    const nextPosition = (maxPosition?.queuePosition || 0) + 1;

    // Update post to READY status with queue position
    const [updated] = await sql`
      UPDATE posts SET status = 'READY', "queuePosition" = ${nextPosition} WHERE id = ${postId} RETURNING *
    `;

    return Response.json({
      success: true,
      data: updated,
      message: "Post added to queue",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
