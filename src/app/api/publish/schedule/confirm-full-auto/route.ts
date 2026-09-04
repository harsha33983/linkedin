import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";

/**
 * POST /api/publish/schedule/confirm-full-auto — Confirm Full Auto activation
 *
 * PRD §8.9: Full Auto requires a separate, explicit confirmation step.
 * "I understand posts will go out without my review"
 */
export async function POST(request: any) {
  try {
    const userId = await requireAuthFromRequest(request as any);

    const [schedule] = await sql`
      INSERT INTO publish_schedules (
        id, "userId", mode, "postingDays", "maxPerDay", "isPaused", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, 'full_auto', ARRAY[1,2,3,4,5], 1, false, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId") DO UPDATE SET
        mode = 'full_auto',
        "isPaused" = false,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING *
    `;

    return Response.json({
      success: true,
      data: schedule,
      message:
        "Full Auto mode activated. Posts will publish from your approved patterns. You can pause anytime.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
