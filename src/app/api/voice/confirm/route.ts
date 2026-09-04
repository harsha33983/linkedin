import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { z } from "zod";

const confirmSchema = z.object({
  confirmed: z.boolean(),
});

/**
 * POST /api/voice/confirm — Confirm Voice DNA ("Does this sound like you?")
 *
 * PRD §5.2: This is the single highest-leverage feedback point in the product.
 * Never gated behind payment (§19).
 */
export async function POST(request: Request) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const { confirmed } = confirmSchema.parse(body);

    const [voiceProfile] = await sql`
      UPDATE voice_profiles SET "userConfirmed" = ${confirmed} WHERE "userId" = ${userId} RETURNING *
    `;

    return Response.json({
      success: true,
      data: {
        userConfirmed: voiceProfile.userConfirmed,
        message: confirmed
          ? "Great! We'll use this as your voice baseline."
          : "No problem — add more samples or adjust preferences to improve your Voice DNA.",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
