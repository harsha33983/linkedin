import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, NotFoundError } from "@/lib/errors/api-errors";

/**
 * POST /api/posts/[id]/duplicate — Duplicate a post as DRAFT
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

    const newTitle = existing.title ? `${existing.title} (copy)` : null;

    const [duplicate] = await sql`
      INSERT INTO posts (
        id, "userId", title, content, topic, format, status, "voiceDnaVersionUsed", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, ${newTitle}, ${existing.content}, ${existing.topic || null}, 
        ${existing.format || null}, 'DRAFT', ${existing.voiceDnaVersionUsed || null}, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;

    return Response.json(
      { success: true, data: duplicate },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
