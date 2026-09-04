/**
 * DELETE /api/linkedin/disconnect — Disconnect LinkedIn account
 *
 * Immediately halts all auto-publishing.
 * Does not delete already-published post history.
 */

import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { recordAuditEvent } from "@/lib/audit/service";
import { handleApiError } from "@/lib/errors/api-errors";

export async function DELETE(request: Request) {
  try {
    const userId = await requireAuthFromRequest(request);

    // Find existing connection
    const [connection] = await sql`
      SELECT id FROM social_accounts WHERE "userId" = ${userId} AND provider = 'LINKEDIN' LIMIT 1
    `;

    if (!connection) {
      return Response.json(
        { success: false, error: "No LinkedIn account connected" },
        { status: 404 }
      );
    }

    // Mark as disconnected (don't delete — preserve history)
    await sql`
      UPDATE social_accounts SET status = 'DISCONNECTED' WHERE id = ${connection.id}
    `;

    // Reset publish schedule to manual
    await sql`
      UPDATE publish_schedules 
      SET mode = 'manual', "isPaused" = true, "linkedinAccountId" = null 
      WHERE "userId" = ${userId}
    `;

    // Audit log
    await recordAuditEvent({
      userId,
      action: "USER_DISCONNECTED_LINKEDIN",
      targetId: connection.id,
      targetType: "social_account",
      request,
    });

    return Response.json({
      success: true,
      message: "LinkedIn disconnected. Auto-publishing halted. Post history preserved.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
