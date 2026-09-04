import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { z } from "zod";

const updateScheduleSchema = z.object({
  mode: z.enum(["manual", "approved_queue", "full_auto"]).optional(),
  postingTime: z.string().optional(), // "09:00"
  postingDays: z.array(z.number().min(0).max(6)).optional(),
  maxPerDay: z.number().min(1).max(2).optional(),
  isPaused: z.boolean().optional(),
});

/**
 * GET /api/publish/schedule — Get publish schedule
 */
export async function GET(request: any) {
  try {
    const userId = await requireAuthFromRequest(request as any);

    const [schedule] = await sql`SELECT * FROM publish_schedules WHERE "userId" = ${userId} LIMIT 1`;

    return Response.json({
      success: true,
      data: schedule || {
        mode: "manual",
        postingDays: [1, 2, 3, 4, 5],
        maxPerDay: 1,
        isPaused: false,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/publish/schedule — Update publish schedule
 *
 * PRD §8.9:
 * - Manual is always default for new connections
 * - Full Auto requires explicit confirmation step
 * - Pause toggle works instantly (no confirmation friction)
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const parsed = updateScheduleSchema.parse(body);

    // Prevent Full Auto as default for new connections
    if (parsed.mode === "full_auto") {
      // Check if this is a first-time activation
      const [existing] = await sql`SELECT * FROM publish_schedules WHERE "userId" = ${userId} LIMIT 1`;

      if (!existing || (existing.mode !== "full_auto" && !existing.isPaused)) {
        // Require explicit confirmation via separate endpoint
        return Response.json(
          {
            success: false,
            error: "Full Auto requires explicit confirmation. Use /api/publish/schedule/confirm-full-auto.",
          },
          { status: 400 }
        );
      }
    }

    const [schedule] = await sql`
      INSERT INTO publish_schedules (
        id, "userId", mode, "postingTime", "postingDays", "maxPerDay", "isPaused", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, ${parsed.mode || 'manual'}, ${parsed.postingTime || null}, 
        ${parsed.postingDays ? JSON.stringify(parsed.postingDays) + '::jsonb' : 'ARRAY[1,2,3,4,5]'}, 
        ${parsed.maxPerDay || 1}, ${parsed.isPaused ?? false}, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId") DO UPDATE SET
        mode = COALESCE(${parsed.mode || null}, mode),
        "postingTime" = COALESCE(${parsed.postingTime || null}, "postingTime"),
        "postingDays" = COALESCE(${parsed.postingDays ? JSON.stringify(parsed.postingDays) + '::jsonb' : null}, "postingDays"),
        "maxPerDay" = COALESCE(${parsed.maxPerDay || null}, "maxPerDay"),
        "isPaused" = COALESCE(${parsed.isPaused ?? null}, "isPaused"),
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING *
    `;

    return Response.json({ success: true, data: schedule });
  } catch (error) {
    return handleApiError(error);
  }
}
