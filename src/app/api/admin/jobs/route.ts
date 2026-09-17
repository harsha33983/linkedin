/**
 * GET  /api/admin/jobs — Job Monitor data
 * POST /api/admin/jobs — Actions on monitored jobs (retry failed / clear stale lock)
 *
 * The publish pipeline is a DB-backed cron (src/lib/scheduler/publisher.ts):
 * it polls `posts` for READY / SCHEDULED rows and locks each one with
 * publishLockId while publishing; results land in publish_logs. Nothing
 * writes the legacy queue_jobs table, so this endpoint derives live job
 * rows from those two real sources instead.
 */

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { z } from "zod";
import { getSchedulerStatus } from "@/lib/scheduler/publisher";

interface MonitorJob {
  id: string;
  postId: string | null;
  jobType: string;
  status: "QUEUED" | "PROCESSING" | "SUCCESS" | "FAILED" | "RETRYING";
  attempts: number;
  maxAttempts: number;
  scheduledAt: string | null;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
  post: { id: string; title: string | null; status: string } | null;
}

const actionSchema = z.object({
  action: z.enum(["clear_stale_lock", "clear_history"]),
  postId: z.string().uuid().optional(),
});

function classify(
  status: string,
  publishLockId: string | null,
  errorMessage: string | null
): MonitorJob["status"] {
  if (publishLockId && publishLockId !== "") return "PROCESSING";
  if (status === "SCHEDULED" || status === "READY") return errorMessage ? "RETRYING" : "QUEUED";
  if (status === "PUBLISHED") return "SUCCESS";
  if (status === "FAILED") return "FAILED";
  return "QUEUED";
}

export async function GET(request: Request) {
  try {
    const userId = await requireAuthFromRequest(request);

    // Scheduler health (in-process interval + active recurring schedules)
    const scheduler = await getSchedulerStatus();

    const [userSchedule] = await sql`
      SELECT mode, "isPaused", "postingTime", "postingTimezone", "maxPerDay"
      FROM publish_schedules WHERE "userId" = ${userId} LIMIT 1
    `;

    const [pending] = await sql`
      SELECT COUNT(*)::int AS cnt FROM posts
      WHERE "userId" = ${userId} AND status IN ('READY', 'SCHEDULED')
    `;
    const [publishedToday] = await sql`
      SELECT COUNT(*)::int AS cnt FROM posts
      WHERE "userId" = ${userId} AND status = 'PUBLISHED'
        AND "publishedAt" >= (now() AT TIME ZONE 'UTC')::date
    `;
    const [locked] = await sql`
      SELECT COUNT(*)::int AS cnt FROM posts
      WHERE "userId" = ${userId} AND "publishLockId" IS NOT NULL AND "publishLockId" != ''
    `;

    // Queued / in-flight jobs = READY + SCHEDULED posts (+ processing locks)
    const pendingRows = await sql`
      SELECT id, title, status, "publishLockId", "scheduledAt", "scheduledAtUTC",
             "scheduledTimezone", "errorMessage", "updatedAt", "createdAt"
      FROM posts
      WHERE "userId" = ${userId} AND status IN ('READY', 'SCHEDULED')
      ORDER BY COALESCE("scheduledAt", "scheduledAtUTC", "createdAt") ASC
      LIMIT 50
    `;

    // History = most recent publish attempts (from publish_logs + failed posts)
    const historyRows = await sql`
      SELECT p.id AS "postId", p.title, l.status, l."errorMessage", l."errorType",
             l."publishedAt", l."publishedBy", p."externalPostId"
      FROM publish_logs l
      JOIN posts p ON p.id = l."postId"
      WHERE l."userId" = ${userId}
      ORDER BY l."publishedAt" DESC
      LIMIT 30
    `;

    const failedPosts = await sql`
      SELECT id, title, status, "publishLockId", "updatedAt" AS "lastAttemptAt",
             "externalPostId"
      FROM posts
      WHERE "userId" = ${userId} AND status = 'FAILED'
      ORDER BY "updatedAt" DESC
      LIMIT 20
    `;

    const jobs: MonitorJob[] = [];

    for (const row of pendingRows as any[]) {
      const scheduledAt = row.scheduledAt || row.scheduledAtUTC;
      jobs.push({
        id: `job_${row.id}`,
        postId: row.id,
        jobType: row.status === "SCHEDULED" ? "scheduled_publish" : "auto_publish",
        status: classify(row.status, row.publishLockId, null),
        attempts: 0,
        maxAttempts: 3,
        scheduledAt: scheduledAt || null,
        lastAttemptAt: row.updatedAt,
        errorMessage: null,
        completedAt: null,
        createdAt: row.createdAt,
        post: { id: row.id, title: row.title, status: row.status },
      });
    }

    for (const row of historyRows as any[]) {
      const success = row.status === "success";
      jobs.push({
        id: `log_${row.postId}_${new Date(row.publishedAt).getTime()}`,
        postId: row.postId,
        jobType: row.publishedBy === "scheduler" ? "scheduled_publish" : "manual_publish",
        status: success ? "SUCCESS" : "FAILED",
        attempts: 1,
        maxAttempts: 3,
        scheduledAt: null,
        lastAttemptAt: row.publishedAt,
        errorMessage: row.errorMessage || null,
        completedAt: success ? row.publishedAt : null,
        createdAt: row.publishedAt,
        post: { id: row.postId, title: row.title, status: success ? "PUBLISHED" : "FAILED" },
      });
    }

    for (const row of failedPosts as any[]) {
      // Dedupe: publish_logs usually already covers the failure.
      if (jobs.some((j) => j.postId === row.id && j.status === "FAILED")) continue;
      jobs.push({
        id: `fail_${row.id}`,
        postId: row.id,
        jobType: "publish",
        status: "FAILED",
        attempts: 1,
        maxAttempts: 3,
        scheduledAt: null,
        lastAttemptAt: row.lastAttemptAt,
        errorMessage: "Publishing failed — check logs or retry manually.",
        completedAt: null,
        createdAt: row.lastAttemptAt,
        post: { id: row.id, title: row.title, status: "FAILED" },
      });
    }

    jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return Response.json({
      success: true,
      data: jobs,
      total: jobs.length,
      scheduler: {
        running: scheduler.running,
        activeSchedules: scheduler.activeSchedules,
        userSchedule: userSchedule || null,
        pendingPosts: pending[0]?.cnt || 0,
        publishedToday: publishedToday[0]?.cnt || 0,
        lockedPosts: locked[0]?.cnt || 0,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/admin/jobs — maintenance actions
 *   clear_stale_lock: release publishLockId on a stuck post so it can be re-processed
 *   clear_history: remove failed rows the user has acknowledged (sets posts back to DRAFT)
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request);
    const parsed = actionSchema.parse(await request.json());

    if (parsed.action === "clear_stale_lock") {
      if (!parsed.postId) {
        return Response.json({ success: false, error: "postId required" }, { status: 400 });
      }
      const result = await sql`
        UPDATE posts
        SET "publishLockId" = NULL, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${parsed.postId} AND "userId" = ${userId}
          AND "publishLockId" IS NOT NULL AND "publishLockId" != ''
        RETURNING id
      `;
      return Response.json({
        success: true,
        message:
          result.length > 0
            ? "Lock released — the scheduler will retry this post."
            : "No active lock on that post.",
      });
    }

    // clear_history: reset FAILED posts to DRAFT so they leave the failed view
    const result = await sql`
      UPDATE posts
      SET status = 'DRAFT', "publishLockId" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND status = 'FAILED'
      RETURNING id
    `;
    return Response.json({
      success: true,
      message: `${result.length} failed post(s) returned to drafts.`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
