/**
 * Voice DNA — Auto-import the user's own published posts as writing samples.
 *
 * The user's PUBLISHED posts (content that actually went out to their LinkedIn)
 * are the most representative "how they write" samples available. This helper
 * copies them into `writing_samples` (deduped by content prefix) so Voice DNA
 * can be built — or refreshed — without the user manually pasting anything.
 */

import { sql } from "@/lib/db";

export interface ImportPostsResult {
  imported: number;
  totalSamples: number;
}

/**
 * Import the user's own PUBLISHED posts into writing_samples.
 * Idempotent: posts whose content prefix already exists as a sample are skipped.
 *
 * @param userId  owner of the posts / samples
 * @param maxPosts cap on how many recent posts are imported at once (default 20)
 */
export async function importPublishedPostsAsSamples(
  userId: string,
  maxPosts = 20
): Promise<ImportPostsResult> {
  const posts = (await sql`
    SELECT id, content, "publishedAt"
    FROM posts
    WHERE "userId" = ${userId}
      AND status = 'PUBLISHED'
      AND content IS NOT NULL
      AND length(content) > 20
    ORDER BY COALESCE("publishedAt", "createdAt") DESC
    LIMIT ${maxPosts}
  `) as Array<{ id: string; content: string; publishedAt: string | null }>;

  if (posts.length === 0) {
    const [{ count }] = (await sql`
      SELECT COUNT(*)::int AS count FROM writing_samples WHERE "userId" = ${userId}
    `) as Array<{ count: number }>;
    return { imported: 0, totalSamples: count };
  }

  const existing = (await sql`
    SELECT content FROM writing_samples WHERE "userId" = ${userId}
  `) as Array<{ content: string }>;

  const seen = new Set(
    existing.map((s) => (s.content || "").substring(0, 120).toLowerCase())
  );

  let imported = 0;
  for (const post of posts) {
    const prefix = (post.content || "").substring(0, 120).toLowerCase();
    if (seen.has(prefix)) continue;
    seen.add(prefix);

    const createdAt = post.publishedAt ? new Date(post.publishedAt) : new Date();
    await sql`
      INSERT INTO writing_samples (
        id, "userId", content, source, "sourceType", weight, "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, ${post.content},
        'linkedin_post', 'linkedin_post', 1.0,
        ${createdAt.toISOString()}::timestamp, CURRENT_TIMESTAMP
      )
    `;
    imported++;
  }

  const [{ count }] = (await sql`
    SELECT COUNT(*)::int AS count FROM writing_samples WHERE "userId" = ${userId}
  `) as Array<{ count: number }>;

  if (imported > 0) {
    console.log(
      `[Voice] Auto-imported ${imported} published post(s) as writing samples for user ${userId}`
    );
  }

  return { imported, totalSamples: count };
}
