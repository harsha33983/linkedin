/**
 * GET /api/schedule — Get auto-publish schedule
 * PATCH /api/schedule — Update auto-publish schedule (mode, time, timezone, days)
 */

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { recordAuditEvent } from "@/lib/audit/service";
import { z } from "zod";

const updateScheduleSchema = z.object({
  mode: z.enum(["manual", "approved_queue", "full_auto"]).optional(),
  postingTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  postingTimezone: z.string().optional(),
  postingDays: z.array(z.number().min(0).max(6)).optional(),
  maxPerDay: z.number().min(1).max(5).optional(),
  isPaused: z.boolean().optional(),
  linkedinAccountId: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const userId = await requireAuthFromRequest(request);

    const [schedule] = await sql`SELECT * FROM publish_schedules WHERE "userId" = ${userId} LIMIT 1`;

    if (!schedule) {
      return Response.json({
        success: true,
        data: {
          mode: "manual",
          postingTime: "09:00",
          postingTimezone: "UTC",
          postingDays: [1, 2, 3, 4, 5],
          maxPerDay: 1,
          isPaused: false,
          linkedinAccountId: null,
        },
      });
    }

    return Response.json({ success: true, data: schedule });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request);
    const body = await request.json();
    const parsed = updateScheduleSchema.parse(body);

    // Ensure schedule exists (upsert)
    await sql`
      INSERT INTO publish_schedules (
        id, "userId", mode, "postingTime", "postingDays", "maxPerDay", "postingTimezone", "isPaused", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, 'manual', '09:00', ARRAY[1,2,3,4,5], 1, 'UTC', false, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId") DO NOTHING
    `;

    // Validate mode change
    if (parsed.mode === "full_auto") {
      return Response.json(
        {
          success: false,
          error: "Use /api/schedule/confirm-full-auto for Full Auto mode",
        },
        { status: 400 }
      );
    }

    // Apply each field update individually using tagged templates (safe, no SQL injection)
    if (parsed.mode) {
      await sql`UPDATE publish_schedules SET mode = ${parsed.mode}, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ${userId}`;
    }
    if (parsed.postingTime) {
      await sql`UPDATE publish_schedules SET "postingTime" = ${parsed.postingTime}, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ${userId}`;
    }
    if (parsed.postingTimezone) {
      await sql`UPDATE publish_schedules SET "postingTimezone" = ${parsed.postingTimezone}, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ${userId}`;
    }
    if (parsed.maxPerDay) {
      await sql`UPDATE publish_schedules SET "maxPerDay" = ${parsed.maxPerDay}, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ${userId}`;
    }
    if (parsed.isPaused !== undefined) {
      await sql`UPDATE publish_schedules SET "isPaused" = ${parsed.isPaused}, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ${userId}`;
    }
    if (parsed.linkedinAccountId) {
      await sql`UPDATE publish_schedules SET "linkedinAccountId" = ${parsed.linkedinAccountId}, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ${userId}`;
    }
    if (parsed.postingDays) {
      await sql`UPDATE publish_schedules SET "postingDays" = ${parsed.postingDays}::int[], "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ${userId}`;
    }

    // Fetch the final updated schedule
    const [updated] = await sql`SELECT * FROM publish_schedules WHERE "userId" = ${userId} LIMIT 1`;

    if (updated) {
      await recordAuditEvent({
        userId,
        action: "SCHEDULE_CHANGED",
        targetId: updated.id,
        targetType: "schedule",
        metadata: { changes: parsed },
        request,
      });
    }

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
