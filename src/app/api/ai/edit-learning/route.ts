import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors/api-errors";
import { recordUserEdit } from "@/lib/ai/edit-learning";
import { z } from "zod";

const editLearningSchema = z.object({
  generationId: z.string().min(1),
  versionId: z.string().min(1).optional(),
  aiDraft: z.string().min(1).max(20_000),
  final: z.string().min(1).max(20_000),
});

/**
 * POST /api/ai/edit-learning — learn from a user's edit of an AI draft.
 *
 * Computes a structured diff (opener, sentence length, emoji/hashtag use,
 * formatting, clichés removed), aggregates durable patterns into
 * style_adjustments, and stores the final text as a style example.
 * Fire-and-forget semantics for the caller: never blocks editing UX.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const parsed = editLearningSchema.parse(body);

    if (parsed.aiDraft.trim() === parsed.final.trim()) {
      return Response.json({ success: true, learned: false, reason: "no_change" });
    }

    // Verify the generation belongs to this user (authorization).
    const [gen] = await sql`
      SELECT id FROM generations WHERE id = ${parsed.generationId} AND "userId" = ${userId} LIMIT 1
    `;
    if (!gen) throw new NotFoundError("Generation", parsed.generationId);

    await recordUserEdit(userId, parsed.aiDraft, parsed.final);

    return Response.json({ success: true, learned: true });
  } catch (error) {
    if (error instanceof ValidationError || (error as any)?.name === "ZodError") {
      return Response.json(
        { success: false, error: "Invalid edit payload." },
        { status: 400 }
      );
    }
    return handleApiError(error);
  }
}
