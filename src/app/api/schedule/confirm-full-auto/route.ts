/**
 * POST /api/schedule/confirm-full-auto — Activate Full Auto publishing mode
 *
 * Requires explicit user confirmation (PRD §8.9).
 * Full Auto mode publishes AI-generated drafts without per-post review,
 * but only from content matching previously-approved patterns.
 */

import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { recordAuditEvent } from "@/lib/audit/service";

export async function POST(request: Request) {
  try {
    const userId = await requireAuthFromRequest(request);

    // Ensure schedule exists
    const [schedule] = await sql`
      INSERT INTO publish_schedules (
        id, "userId", mode, "postingDays", "maxPerDay", "postingTimezone", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, 'manual', ARRAY[1,2,3,4,5], 1, 'UTC', CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId") DO NOTHING
      RETURNING *
    `;

    const [updated] = await sql`
      UPDATE publish_schedules 
      SET mode = 'full_auto', "isPaused" = false, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
      RETURNING *
    `;

    await recordAuditEvent({
      userId,
      action: "AUTO_PUBLISH_ENABLED",
      targetId: schedule.id,
      targetType: "schedule",
      metadata: { mode: "full_auto" },
      request,
    });

    return Response.json({
      success: true,
      data: updated,
      message: "Full Auto mode activated. Posts will publish without per-post review.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
