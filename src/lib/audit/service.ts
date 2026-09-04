/**
 * Audit Log Service
 *
 * Records security-relevant events for compliance and debugging.
 * NEVER stores secrets, tokens, or sensitive data in audit logs.
 *
 * Events tracked (§20):
 * USER_CONNECTED_LINKEDIN, USER_DISCONNECTED_LINKEDIN,
 * POST_SCHEDULED, POST_PUBLISH_STARTED, POST_PUBLISHED,
 * POST_PUBLISH_FAILED, POST_RETRY, TOKEN_REFRESHED, TOKEN_EXPIRED
 */

import { sql } from "@/lib/db";

export type AuditAction =
  | "USER_CONNECTED_LINKEDIN"
  | "USER_DISCONNECTED_LINKEDIN"
  | "USER_RECONNECTED_LINKEDIN"
  | "POST_SCHEDULED"
  | "POST_PUBLISH_STARTED"
  | "POST_PUBLISHED"
  | "POST_PUBLISH_FAILED"
  | "POST_RETRY"
  | "TOKEN_REFRESHED"
  | "TOKEN_EXPIRED"
  | "POST_APPROVED"
  | "POST_UNAPPROVED"
  | "POST_QUEUE_REORDERED"
  | "SCHEDULE_CHANGED"
  | "AUTO_PUBLISH_ENABLED"
  | "AUTO_PUBLISH_DISABLED"
  | "AUTO_PUBLISH_PAUSED"
  | "AUTO_PUBLISH_RESUMED";

interface AuditLogParams {
  userId: string;
  action: AuditAction;
  targetId?: string;
  targetType?: "post" | "social_account" | "schedule" | "queue_job";
  metadata?: Record<string, unknown>;
  request?: Request;
}

/**
 * Record an audit event.
 * Sanitizes metadata to ensure no secrets leak.
 */
export async function recordAuditEvent(params: AuditLogParams): Promise<void> {
  const { userId, action, targetId, targetType, metadata, request } = params;

  // Sanitize metadata — strip anything that looks like a token
  const sanitizedMetadata = metadata
    ? sanitizeMetadata(metadata)
    : undefined;

  // Extract non-sensitive request info
  let ipAddress: string | undefined;
  let userAgent: string | undefined;

  if (request) {
    ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] || undefined;
    userAgent = request.headers.get("user-agent") || undefined;
  }

  try {
    await sql`
      INSERT INTO audit_logs (
        id, "userId", action, "targetId", "targetType", metadata, "ipAddress", "userAgent", "createdAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, ${action}, ${targetId || null}, ${targetType || null}, 
        ${sanitizedMetadata ? JSON.stringify(sanitizedMetadata) : null}, 
        ${ipAddress || null}, ${userAgent || null}, CURRENT_TIMESTAMP
      )
    `;
  } catch (error) {
    // Audit logging should never crash the main flow
    console.error("[AuditLog] Failed to record event:", error);
  }
}

/**
 * Sanitize metadata to remove sensitive fields.
 */
function sanitizeMetadata(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    "accessToken", "refreshToken", "clientSecret", "password",
    "token", "secret", "authorization", "cookie",
  ];

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk.toLowerCase()))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Get recent audit logs for a user.
 */
export async function getAuditLogs(
  userId: string,
  options: { limit?: number; offset?: number; action?: string } = {}
) {
  const { limit = 50, offset = 0, action } = options;

  let queryStr = `SELECT id, action, "targetId", "targetType", metadata, "createdAt" FROM audit_logs WHERE "userId" = $1`;
  const params: any[] = [userId];
  
  if (action) {
    queryStr += ` AND action = $2`;
    params.push(action);
  }
  
  queryStr += ` ORDER BY "createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  return (sql as any).query(queryStr, params);
}
