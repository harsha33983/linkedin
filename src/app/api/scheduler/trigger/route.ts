/**
 * POST /api/scheduler/trigger — Manually trigger the scheduler to process due posts
 * GET  /api/scheduler/trigger — Get scheduler status
 *
 * Useful for:
 * - Admin job monitor page
 * - Manual override to publish immediately
 * - Testing the scheduler without waiting for the cron tick
 */

import { NextRequest } from "next/server";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { sql } from "@/lib/db";
import { publishTextPost } from "@/lib/linkedin/publishing";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthFromRequest(request);

    // Get scheduler status for this user
    const [schedule] = await sql`
      SELECT * FROM publish_schedules WHERE "userId" = ${userId} LIMIT 1
    `;

    const pendingPosts = await sql`
      SELECT COUNT(*)::int AS cnt FROM posts
      WHERE "userId" = ${userId} AND status IN ('READY', 'SCHEDULED')
    `;

    const todayPublished = await sql`
      SELECT COUNT(*)::int AS cnt FROM posts
      WHERE "userId" = ${userId} AND status = 'PUBLISHED'
      AND "publishedAt" >= CURRENT_DATE
    `;

    const lockedPosts = await sql`
      SELECT COUNT(*)::int AS cnt FROM posts
      WHERE "userId" = ${userId} AND "publishLockId" IS NOT NULL AND "publishLockId" != ''
    `;

    return Response.json({
      success: true,
      data: {
        schedule: schedule || { mode: "manual", isPaused: true },
        pendingPosts: pendingPosts[0]?.cnt || 0,
        todayPublished: todayPublished[0]?.cnt || 0,
        lockedPosts: lockedPosts[0]?.cnt || 0,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request);

    // Find next READY post
    const [post] = await sql`
      SELECT id, content, "imageUrl" FROM posts
      WHERE "userId" = ${userId}
      AND status = 'READY'
      AND "publishLockId" IS NULL
      ORDER BY "queuePosition" ASC NULLS LAST, "createdAt" ASC
      LIMIT 1
    `;

    if (!post) {
      return Response.json(
        { success: false, error: "No READY posts in queue to publish" },
        { status: 404 }
      );
    }

    // Acquire lock
    const lockId = `manual_${Date.now()}`;
    const locked = await sql`
      UPDATE posts SET "publishLockId" = ${lockId}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${post.id} AND ("publishLockId" IS NULL OR "publishLockId" = '')
      RETURNING id
    `;

    if (locked.length === 0) {
      return Response.json(
        { success: false, error: "Post is being processed by another job" },
        { status: 409 }
      );
    }

    // Publish
    const result = await publishTextPost({
      postId: post.id,
      userId,
      content: post.content,
      imageUrl: post.imageUrl || undefined,
      request,
    });

    if (result.success) {
      return Response.json({
        success: true,
        message: "Published to LinkedIn!",
        data: { postId: result.externalPostId },
      });
    } else {
      return Response.json(
        { success: false, error: result.error, errorType: result.errorType },
        { status: result.httpStatus || 500 }
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}
