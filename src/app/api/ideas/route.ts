import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { z } from "zod";

const ideaSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().nullable(),
  topic: z.string().max(100).optional().nullable(),
  format: z.string().max(50).optional().nullable(),
  suggestionReason: z.string().max(500).optional().nullable(),
});

const postIdeasSchema = z.object({
  ideas: z.array(ideaSchema).min(1).max(20),
});

/**
 * POST /api/ideas — Save generated ideas to the user's idea library
 *
 * Accepts a batch ({ ideas: [...] }) from the Ideas module. Duplicates are
 * detected case-insensitively by title and skipped, so regenerating a batch
 * never floods the library with the same idea twice.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();

    // Accept both a single idea object and the batch shape { ideas: [...] }.
    const { ideas } = Array.isArray(body?.ideas)
      ? postIdeasSchema.parse(body)
      : { ideas: [ideaSchema.parse(body)] };

    const saved: any[] = [];
    let duplicates = 0;

    for (const idea of ideas) {
      const [existing] = await sql`
        SELECT id FROM content_ideas
        WHERE "userId" = ${userId} AND LOWER(title) = LOWER(${idea.title})
        LIMIT 1
      `;
      if (existing) {
        duplicates += 1;
        continue;
      }

      const [row] = await sql`
        INSERT INTO content_ideas (
          id, "userId", title, description, topic, format, status, "suggestionReason"
        ) VALUES (
          gen_random_uuid(), ${userId}, ${idea.title}, ${idea.description || null},
          ${idea.topic || null}, ${idea.format || null}, 'active', ${idea.suggestionReason || null}
        )
        RETURNING *
      `;
      saved.push(row);
    }

    return Response.json({
      success: true,
      data: saved,
      total: saved.length,
      duplicates,
      message:
        saved.length > 0
          ? `Saved ${saved.length} idea${saved.length === 1 ? "" : "s"}${
              duplicates > 0 ? ` (${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped)` : ""
            }.`
          : duplicates > 0
          ? "Those ideas are already in your library."
          : "Nothing to save.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/ideas — List all content ideas with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "active";

    const ideas = await sql`
      SELECT * FROM content_ideas 
      WHERE "userId" = ${userId} AND status = ${status}
      ORDER BY "createdAt" DESC
    `;

    return Response.json({ success: true, data: ideas, total: ideas.length });
  } catch (error) {
    return handleApiError(error);
  }
}
