/**
 * GET /api/linkedin/status — Connection health and token expiry
 */

import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthFromRequest(request);

    const [connection] = await sql`
      SELECT id, status, "displayName", "connectedAt", "expiresAt", "providerAccountId" 
      FROM social_accounts 
      WHERE "userId" = ${userId} AND provider = 'LINKEDIN' 
      LIMIT 1
    `;

    const [schedule] = await sql`
      SELECT * FROM publish_schedules 
      WHERE "userId" = ${userId}
    `;

    if (!connection) {
      return Response.json({
        success: true,
        data: { connected: false, schedule: null },
      });
    }

    const isTokenValid = connection.expiresAt > new Date() && connection.status === "CONNECTED";

    return Response.json({
      success: true,
      data: {
        connected: true,
        socialAccountId: connection.id,
        status: connection.status,
        displayName: connection.displayName,
        linkedInMemberId: connection.providerAccountId,
        connectedAt: connection.connectedAt,
        tokenValid: isTokenValid,
        expiresAt: connection.expiresAt,
        schedule: schedule
          ? {
              mode: schedule.mode,
              postingTime: schedule.postingTime,
              postingTimezone: schedule.postingTimezone,
              postingDays: schedule.postingDays,
              maxPerDay: schedule.maxPerDay,
              isPaused: schedule.isPaused,
              linkedinAccountId: schedule.linkedinAccountId,
            }
          : null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
