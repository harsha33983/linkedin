"use server";

/**
 * Neon Serverless Actions
 *
 * Direct SQL queries via @neondatabase/serverless for server components.
 * Use Prisma for ORM queries; use this for raw SQL when needed.
 */

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

/**
 * Execute a raw SQL query.
 * Use template literals for parameterized queries (safe from SQL injection).
 *
 * @example
 *   const users = await query`SELECT * FROM users WHERE id = ${userId}`;
 */
export async function query(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<Record<string, unknown>[]> {
  const result = await sql(strings, ...values);
  return result as Record<string, unknown>[];
}

/**
 * Get user profile with Voice DNA stats (example cross-table query).
 */
export async function getUserDashboard(userId: string) {
  const result = await sql`
    SELECT
      u.id,
      u.name,
      u.email,
      vp.confidence_score as "confidenceScore",
      vp.sample_count as "sampleCount",
      vp.user_confirmed as "userConfirmed",
      (SELECT COUNT(*)::int FROM posts WHERE user_id = ${userId} AND status = 'DRAFT') as "draftCount",
      (SELECT COUNT(*)::int FROM posts WHERE user_id = ${userId} AND status = 'PUBLISHED') as "publishedCount",
      (SELECT COUNT(*)::int FROM content_ideas WHERE user_id = ${userId} AND status = 'active') as "ideaCount",
      (SELECT COUNT(*)::int FROM posts WHERE user_id = ${userId} AND created_at > now() - interval '7 days') as "thisWeekCount"
    FROM users u
    LEFT JOIN voice_profiles vp ON vp.user_id = u.id
    WHERE u.id = ${userId}
  `;
  return result[0] || null;
}

/**
 * Get publish queue for a user (approved posts, sorted by created_at).
 */
export async function getPublishQueue(userId: string, limit = 10) {
  const result = await sql`
    SELECT
      p.id,
      p.title,
      p.content,
      p.topic,
      p.format,
      p.status,
      p.created_at as "createdAt"
    FROM posts p
    WHERE p.user_id = ${userId}
      AND p.status = 'APPROVED'
    ORDER BY p.created_at ASC
    LIMIT ${limit}
  `;
  return result;
}

/**
 * Get publish log for a user.
 */
export async function getPublishLog(userId: string, limit = 50) {
  const result = await sql`
    SELECT
      pl.id,
      pl.post_id as "postId",
      pl.published_at as "publishedAt",
      pl.approved_by as "approvedBy",
      pl.approved_at as "approvedAt",
      pl.status,
      pl.error_message as "errorMessage",
      p.title as "postTitle",
      p.topic as "postTopic"
    FROM publish_logs pl
    LEFT JOIN posts p ON p.id = pl.post_id
    WHERE pl.user_id = ${userId}
    ORDER BY pl.published_at DESC
    LIMIT ${limit}
  `;
  return result;
}

/**
 * Record a publish event.
 */
export async function recordPublishLog(data: {
  postId: string;
  userId: string;
  approvedBy?: string;
  approvedAt?: Date;
  status: string;
  errorMessage?: string;
}) {
  const result = await sql`
    INSERT INTO publish_logs (id, post_id, user_id, published_at, approved_by, approved_at, status, error_message)
    VALUES (${`pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`},
            ${data.postId},
            ${data.userId},
            now(),
            ${data.approvedBy || null},
            ${data.approvedAt?.toISOString() || null},
            ${data.status},
            ${data.errorMessage || null})
    RETURNING *
  `;
  return result[0];
}
