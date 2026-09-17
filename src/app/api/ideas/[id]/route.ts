import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, NotFoundError } from "@/lib/errors/api-errors";
import { z } from "zod";

const updateIdeaSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  topic: z.string().optional(),
  format: z.string().optional(),
  status: z.enum(["active", "hidden", "dismissed"]).optional(),
});

/**
 * PATCH /api/ideas/[id] — Update an idea (hide, dismiss, edit)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const { id } = params;
    const body = await request.json();
    const parsed = updateIdeaSchema.parse(body);

    const [existing] = await sql`SELECT * FROM content_ideas WHERE id = ${id} AND "userId" = ${userId} LIMIT 1`;
    if (!existing) throw new NotFoundError("ContentIdea", id);

    const dismissedAt = parsed.status === "dismissed" ? new Date() : null;
    // Restoring to active also clears the used marker so the idea can be
    // drafted again; a fresh consume will set usedAt once more.
    const clearUsed = parsed.status === "active";

    const [updated] = await sql`
      UPDATE content_ideas SET
        title = COALESCE(${parsed.title || null}, title),
        description = COALESCE(${parsed.description || null}, description),
        topic = COALESCE(${parsed.topic || null}, topic),
        format = COALESCE(${parsed.format || null}, format),
        status = COALESCE(${parsed.status || null}, status),
        "dismissedAt" = COALESCE(${dismissedAt}, "dismissedAt"),
        "usedAt" = ${clearUsed ? sql`NULL` : sql`"usedAt"`}
      WHERE id = ${id}
      RETURNING *
    `;

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/ideas/[id] — Delete an idea
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireAuthFromRequest(request);
    const { id } = params;

    const [existing] = await sql`SELECT * FROM content_ideas WHERE id = ${id} AND "userId" = ${userId} LIMIT 1`;
    if (!existing) throw new NotFoundError("ContentIdea", id);

    await sql`DELETE FROM content_ideas WHERE id = ${id}`;

    return Response.json({ success: true, message: "Idea deleted." });
  } catch (error) {
    return handleApiError(error);
  }
}
