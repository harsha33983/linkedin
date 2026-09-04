/**
 * GET /api/admin/jobs — List all queue jobs (admin monitoring)
 *
 * Shows: Job ID, User, Post, Scheduled time, Status, Attempts, Last error
 */

import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthFromRequest(request);

    // For MVP, show jobs for the current user only
    // In production, add admin role check
    const jobs = await sql`
      SELECT id, "postId", "jobType", status, attempts, "maxAttempts", "lastAttemptAt", "nextRetryAt", "errorMessage", "completedAt", "failedAt", "createdAt", "lockedBy" 
      FROM queue_jobs 
      WHERE "userId" = ${userId} 
      ORDER BY "createdAt" DESC 
      LIMIT 100
    `;

    // Enrich with post data
    const enrichedJobs = await Promise.all(
      jobs.map(async (job: any) => {
        let postData: { title: string | null; content: string } | null = null;
        if (job.postId) {
          const [post] = await sql`SELECT title, content FROM posts WHERE id = ${job.postId}`;
          if (post) postData = { title: post.title, content: post.content };
        }
        return { ...job, post: postData };
      })
    );

    return Response.json({
      success: true,
      data: enrichedJobs,
      total: enrichedJobs.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
