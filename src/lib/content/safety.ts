/**
 * Content Safety & Quality Check Service
 *
 * Runs before publishing an AI-generated post.
 * PRD §17: Empty-content, character/format, duplicate detection,
 * spam-like repetition, blocked topics, words to avoid.
 */

import { sql } from "@/lib/db";

export interface SafetyCheckResult {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    message?: string;
  }[];
}

/**
 * Run all safety checks on content before publishing.
 * Returns passed: false if ANY check fails.
 */
export async function runContentSafetyChecks(
  userId: string,
  content: string,
  options: {
    checkDuplicates?: boolean;
    checkWordBlocklist?: boolean;
  } = {}
): Promise<SafetyCheckResult> {
  // checkWordBlocklist is opt-in (default OFF): Voice DNA "wordsToAvoid"
  // entries were matched as substrings (e.g. "very" blocked "every") and
  // silently rejected otherwise fine posts at publish time.
  const { checkDuplicates = true, checkWordBlocklist = false } = options;
  const checks: SafetyCheckResult["checks"] = [];

  // 1. Empty content check
  const trimmed = content.trim();
  checks.push({
    name: "empty_content",
    passed: trimmed.length > 0,
    message: trimmed.length === 0 ? "Content is empty" : undefined,
  });

  if (trimmed.length === 0) {
    return { passed: false, checks };
  }

  // 2. Character/format validation
  // Check if content has meaningful text (not just whitespace/symbols)
  const hasTextContent = /[a-zA-Z0-9]/.test(trimmed);
  const hasOnlyEmoji = !hasTextContent && trimmed.length > 0;
  checks.push({
    name: "format_validation",
    passed: !hasOnlyEmoji && trimmed.length >= 10,
    message:
      hasOnlyEmoji
        ? "Content must contain more than just emoji"
        : trimmed.length < 10
        ? "Content is too short (minimum 10 characters)"
        : undefined,
  });

  // 3. LinkedIn character limit (3000 for free accounts)
  checks.push({
    name: "character_limit",
    passed: trimmed.length <= 3000,
    message: trimmed.length > 3000
      ? `Content exceeds LinkedIn's 3000-character limit (${trimmed.length} chars)`
      : undefined,
  });

  // 4. Spam-like repetition detection
  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  const uniqueLines = new Set(lines.map((l) => l.trim().toLowerCase()));
  const repetitionRatio = lines.length > 0 ? uniqueLines.size / lines.length : 1;
  checks.push({
    name: "spam_repetition",
    passed: repetitionRatio > 0.5,
    message:
      repetitionRatio <= 0.5
        ? "Content appears repetitive — too many duplicate lines"
        : undefined,
  });

  // 5. Duplicate detection — check against recent published posts
  if (checkDuplicates) {
    const recentPosts = await sql`
      SELECT content FROM posts 
      WHERE "userId" = ${userId} AND status = 'PUBLISHED' 
      AND "publishedAt" >= (CURRENT_TIMESTAMP - INTERVAL '30 days')
      LIMIT 50
    `;

    const isDuplicate = recentPosts.some((post: any) => {
      const similarity = computeSimilarity(trimmed, post.content);
      return similarity > 0.85; // 85% similarity threshold
    });

    checks.push({
      name: "duplicate_detection",
      passed: !isDuplicate,
      message: isDuplicate
        ? "This content is very similar to a recently published post"
        : undefined,
    });
  }

  // 6. Words to avoid (user-configured)
  if (checkWordBlocklist) {
    const [userProfile] = await sql`SELECT preferences FROM user_profiles WHERE "userId" = ${userId} LIMIT 1`;
    const [voiceProfile] = await sql`SELECT "wordsToAvoid" FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1`;

    const blockedWords = [
      ...((voiceProfile?.wordsToAvoid as string[]) || []),
    ];

    const lowerContent = trimmed.toLowerCase();
    const foundBlocked = blockedWords.filter((w) =>
      lowerContent.includes(w.toLowerCase())
    );

    checks.push({
      name: "blocked_words",
      passed: foundBlocked.length === 0,
      message:
        foundBlocked.length > 0
          ? `Contains blocked words: ${foundBlocked.join(", ")}`
          : undefined,
    });
  }

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

/**
 * Simple text similarity (Jaccard index on word sets).
 * Returns 0–1 where 1 is identical.
 */
function computeSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
  );
  const wordsB = new Set(
    b.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
  );

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of Array.from(wordsA)) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}
