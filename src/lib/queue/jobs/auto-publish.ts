/**
 * Auto-Publish Worker
 *
 * Background job that publishes approved posts daily.
 * PRD §8.9:
 * - Approved Queue: publishes next approved item at user's chosen time
 * - Full Auto: publishes AI-generated drafts from previously-approved patterns
 * - If queue runs empty → skip day, notify user
 * - If token expires → pause auto-publish, notify user
 * - Rate limit: max 1-2 posts/day
 * - Time-jitter: ±15 minutes around scheduled time
 */

import { Worker, Job } from "bullmq";
import { redisConnection } from "../connection";
import { sql } from "@/lib/db";
import { getValidAccessToken } from "@/lib/linkedin/token-refresh";
import { sharePost } from "@/lib/linkedin/api";

interface PublishJobData {
  userId: string;
}

export const autoPublishWorker = new Worker(
  "auto-publish",
  async (job: Job<PublishJobData>) => {
    const { userId } = job.data;
    console.log(`[AutoPublish] Processing user ${userId}`);

    try {
      const [schedule] = await sql`SELECT * FROM publish_schedules WHERE "userId" = ${userId} LIMIT 1`;

      if (!schedule || schedule.mode === "manual" || schedule.isPaused) {
        console.log(`[AutoPublish] User ${userId} not eligible (mode: ${schedule?.mode}, paused: ${schedule?.isPaused})`);
        return;
      }

      // Check if today is a posting day
      const today = new Date().getDay(); // 0=Sun..6=Sat
      if (!schedule.postingDays.includes(today)) {
        console.log(`[AutoPublish] Not a posting day for user ${userId}`);
        return;
      }

      // Check daily post count
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [{ count }] = await sql`
        SELECT COUNT(*)::int as count FROM publish_logs 
        WHERE "userId" = ${userId} AND "publishedAt" >= ${todayStart} AND status = 'success'
      `;
      const postsToday = count;

      if (postsToday >= schedule.maxPerDay) {
        console.log(`[AutoPublish] User ${userId} already at max posts today (${postsToday}/${schedule.maxPerDay})`);
        return;
      }

      // Get access token
      const accessToken = await getValidAccessToken(userId);
      if (!accessToken) {
        await sql`UPDATE publish_schedules SET "isPaused" = true WHERE "userId" = ${userId}`;
        // TODO: Send notification to user
        return;
      }

      const [nextPost] = await sql`
        SELECT * FROM posts WHERE "userId" = ${userId} AND status = 'APPROVED' ORDER BY "updatedAt" ASC LIMIT 1
      `;

      if (!nextPost) {
        console.log(`[AutoPublish] Queue empty for user ${userId} — skipping day`);
        // TODO: Send notification "Nothing queued for today"
        return;
      }

      // Publish
      const result = await sharePost(accessToken, nextPost.content);

      if (result.success) {
        await sql`UPDATE posts SET status = 'PUBLISHED', "publishedAt" = CURRENT_TIMESTAMP WHERE id = ${nextPost.id}`;

        await sql`
          INSERT INTO publish_logs (
            id, "postId", "userId", "approvedBy", "approvedAt", status, "createdAt"
          ) VALUES (
            gen_random_uuid(), ${nextPost.id}, ${userId}, 
            ${schedule.mode === "full_auto" ? "full_auto" : "auto_queue"}, 
            CURRENT_TIMESTAMP, 'success', CURRENT_TIMESTAMP
          )
        `;

        console.log(`[AutoPublish] Published post ${nextPost.id} for user ${userId}`);
      } else {
        await sql`
          INSERT INTO publish_logs (
            id, "postId", "userId", "approvedBy", "approvedAt", status, "errorMessage", "createdAt"
          ) VALUES (
            gen_random_uuid(), ${nextPost.id}, ${userId}, 
            ${schedule.mode === "full_auto" ? "full_auto" : "auto_queue"}, 
            CURRENT_TIMESTAMP, 'failed', ${result.error}, CURRENT_TIMESTAMP
          )
        `;

        console.error(`[AutoPublish] Failed for user ${userId}: ${result.error}`);
        // TODO: Send failure notification to user
      }
    } catch (error) {
      console.error(`[AutoPublish] Error for user ${userId}:`, error);
      // Don't rethrow — let the job complete (don't retry automatically on logic errors)
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

autoPublishWorker.on("failed", (job, err) => {
  console.error(`[AutoPublish] Job ${job?.id} failed:`, err.message);
});

autoPublishWorker.on("completed", (job) => {
  console.log(`[AutoPublish] Job ${job.id} completed`);
});
