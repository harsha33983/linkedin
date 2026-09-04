import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, NotFoundError } from "@/lib/errors/api-errors";
import { z } from "zod";

const updatePostSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  topic: z.string().optional(),
  format: z.string().optional(),
  status: z.enum(["DRAFT", "SAVED", "APPROVED", "SCHEDULED", "PUBLISHED", "ARCHIVED"]).optional(),
  scheduledAt: z.string().optional(),
});

/**
 * PATCH /api/posts/[id] — Update a post
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const { id } = params;
    const body = await request.json();
    const parsed = updatePostSchema.parse(body);

    const [existing] = await sql`SELECT * FROM posts WHERE id = ${id} AND "userId" = ${userId} LIMIT 1`;
    if (!existing) throw new NotFoundError("Post", id);

    // posts.scheduledAt is a naive `timestamp without time zone` column storing
    // the UTC wall clock. Keep it session-timezone-proof by binding the UTC
    // wall-clock text explicitly instead of a JS Date object.
    let scheduledAt: string | null = null;
    if (parsed.scheduledAt) {
      const utcIso = new Date(parsed.scheduledAt).toISOString();
      scheduledAt = utcIso.slice(0, 19).replace("T", " ");
    }

    // Keep scheduledAtUTC in sync with scheduledAt — scheduledAt is the
    // canonical trigger instant for one-off posts.
    const [updated] = await sql`
      UPDATE posts SET
        title = COALESCE(${parsed.title || null}, title),
        content = COALESCE(${parsed.content || null}, content),
        topic = COALESCE(${parsed.topic || null}, topic),
        format = COALESCE(${parsed.format || null}, format),
        status = COALESCE(${parsed.status || null}, status),
        "scheduledAt" = COALESCE(${scheduledAt}, "scheduledAt"),
        "scheduledAtUTC" = COALESCE(${scheduledAt}, "scheduledAtUTC"),
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE id = ${id}
      RETURNING *
    `;

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/posts/[id] — Delete a post
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireAuthFromRequest(request);
    const { id } = params;

    const [existing] = await sql`SELECT * FROM posts WHERE id = ${id} AND "userId" = ${userId} LIMIT 1`;
    if (!existing) throw new NotFoundError("Post", id);

    await sql`DELETE FROM posts WHERE id = ${id}`;

    return Response.json({ success: true, message: "Post deleted." });
  } catch (error) {
    return handleApiError(error);
  }
}
