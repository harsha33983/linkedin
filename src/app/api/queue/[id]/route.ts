/**
 * PATCH /api/queue/:id — Update queue item (reorder, schedule, etc.)
 * DELETE /api/queue/:id — Remove from queue (revert to DRAFT)
 */

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, NotFoundError } from "@/lib/errors/api-errors";
import { publishTextPost } from "@/lib/linkedin/publishing";
import { recordAuditEvent } from "@/lib/audit/service";
import { z } from "zod";

const updateQueueSchema = z.object({
  queuePosition: z.number().optional(),
  scheduledAt: z.string().optional(),
  scheduledTimezone: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireAuthFromRequest(request);
    const { id } = params;

    const [post] = await sql`SELECT * FROM posts WHERE id = ${id} AND "userId" = ${userId} LIMIT 1`;

    if (!post) throw new NotFoundError("Post", id);

    const body = await request.json();
    const parsed = updateQueueSchema.parse(body);

    const updateData: Record<string, unknown> = {};

    // Reorder
    if (parsed.queuePosition !== undefined) {
      updateData.queuePosition = parsed.queuePosition;
    }

    // Schedule for specific time.
    // posts.scheduledAt is a naive `timestamp without time zone` column that
    // stores the UTC wall clock. Bind the UTC wall-clock text explicitly so
    // the write is identical on every session timezone (passing a JS Date
    // through the driver can shift by the session offset).
    if (parsed.scheduledAt) {
      const utcIso = new Date(parsed.scheduledAt).toISOString();
      const naiveUtc = utcIso.slice(0, 19).replace("T", " ");
      updateData.scheduledAt = naiveUtc;
      updateData.scheduledAtUTC = naiveUtc; // Client should send UTC
      updateData.scheduledTimezone = parsed.scheduledTimezone || "UTC";
      updateData.status = "SCHEDULED";
    }

    const [updated] = await sql`
      UPDATE posts SET
        "queuePosition" = COALESCE(${updateData.queuePosition || null}, "queuePosition"),
        "scheduledAt" = COALESCE(${updateData.scheduledAt || null}, "scheduledAt"),
        "scheduledAtUTC" = COALESCE(${updateData.scheduledAtUTC || null}, "scheduledAtUTC"),
        "scheduledTimezone" = COALESCE(${updateData.scheduledTimezone || null}, "scheduledTimezone"),
        status = COALESCE(${updateData.status || null}, status)
      WHERE id = ${id}
      RETURNING *
    `;

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireAuthFromRequest(request);
    const { id } = params;

    const [post] = await sql`SELECT * FROM posts WHERE id = ${id} AND "userId" = ${userId} LIMIT 1`;

    if (!post) throw new NotFoundError("Post", id);

    // Remove from queue
    await sql`
      UPDATE posts SET
        status = 'DRAFT',
        "queuePosition" = null,
        "scheduledAt" = null,
        "scheduledAtUTC" = null,
        "scheduledTimezone" = null
      WHERE id = ${id}
    `;

    return Response.json({
      success: true,
      message: "Post removed from queue",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
