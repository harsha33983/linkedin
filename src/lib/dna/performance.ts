/**
 * Performance DNA Analyzer
 *
 * Analyzes the user's historical post performance to determine:
 * - Which topics perform best
 * - Which hook styles work
 * - Which formats get engagement
 * - Which structures drive comments
 * - Optimal post length
 * - Best posting times
 *
 * IMPORTANT: Every number here is REAL. Metrics are read from
 * posts.publishingResponse.metrics (populated by the LinkedIn analytics sync;
 * shape documented in src/lib/linkedin/metrics.ts). Posts without real metrics
 * are excluded from performance scoring; if nothing is measured yet the DNA is
 * honestly empty (sampleSize 0) instead of being invented.
 *
 * Output: A structured "Performance DNA" that guides future generation.
 */

import { sql } from "@/lib/db";
import { readPostMetrics, type PostMetrics } from "@/lib/linkedin/metrics";

interface PerformanceDNA {
  topicScores: Record<string, number>;
  hookScores: Record<string, number>;
  formatScores: Record<string, number>;
  structureScores: Record<string, number>;
  lengthScores: Record<string, number>;
  timingScores: Record<string, { day: number; hour: number; score: number }>;
  avgEngagementRate: number;
  topPerformingPosts: Array<{ content: string; engagementRate: number; topic: string }>;
  underperformingPatterns: string[];
  confidenceScore: number;
  sampleSize: number;
}

interface AnalyzedPost extends PostMetrics {
  content: string;
  topic: string | null;
  format: string | null;
  hookType: string;
  structure: string;
  length: "short" | "medium" | "long";
  publishedAt: string | null;
  dayOfWeek: number;
  hourOfDay: number;
}

/**
 * Analyze all published posts and compute Performance DNA from REAL metrics.
 */
export async function analyzePerformanceDNA(userId: string): Promise<PerformanceDNA> {
  const posts = await sql`
    SELECT
      content, topic, format, status,
      "externalPostId", "publishingResponse",
      "publishedAt", "createdAt"
    FROM posts
    WHERE "userId" = ${userId}
    AND status = 'PUBLISHED'
    ORDER BY "publishedAt" ASC
  `;

  if (posts.length === 0) {
    await deleteStoredDNA(userId);
    return getEmptyPerformanceDNA();
  }

  // Build per-post records with real metrics (zeros + real:false when unsynced).
  const analyzed: AnalyzedPost[] = (posts as any[]).map((post) => {
    const content = post.content || "";
    const firstLine = content.split("\n")[0] || "";
    const wordCount = content.split(/\s+/).length;
    const metrics = readPostMetrics(post.publishingResponse);

    const pubDate = post.publishedAt ? new Date(post.publishedAt) : new Date(post.createdAt);

    return {
      ...metrics,
      content,
      topic: post.topic,
      format: post.format,
      hookType: detectHookType(firstLine),
      structure: detectStructure(content),
      length: wordCount < 50 ? "short" : wordCount < 150 ? "medium" : "long",
      publishedAt: post.publishedAt,
      dayOfWeek: pubDate.getDay(),
      hourOfDay: pubDate.getHours(),
    };
  });

  // Only posts with REAL measured engagement contribute to scores.
  const withRealMetrics = analyzed.filter((p) => p.real);

  if (withRealMetrics.length === 0) {
    // No real data yet → no invented DNA. Remove any stale (possibly
    // fabricated) stored row so nothing downstream trusts it.
    await deleteStoredDNA(userId);
    return getEmptyPerformanceDNA();
  }

  const avgEngagement =
    withRealMetrics.reduce((sum, m) => sum + m.engagementRate, 0) / withRealMetrics.length;
  const top25Threshold = getPercentile(
    withRealMetrics.map((m) => m.engagementRate),
    0.75
  );

  const topicScores = calculateDimensionScores(withRealMetrics, "topic", top25Threshold);
  const hookScores = calculateDimensionScores(withRealMetrics, "hookType", top25Threshold);
  const formatScores = calculateDimensionScores(withRealMetrics, "format", top25Threshold);
  const structureScores = calculateDimensionScores(withRealMetrics, "structure", top25Threshold);
  const lengthScores = calculateDimensionScores(withRealMetrics, "length", top25Threshold);
  const timingScores = calculateTimingScores(withRealMetrics, top25Threshold);

  const sorted = [...withRealMetrics].sort((a, b) => b.engagementRate - a.engagementRate);
  const topPerformingPosts = sorted
    .slice(0, Math.ceil(sorted.length * 0.25))
    .map((m) => ({
      content: m.content.substring(0, 200),
      engagementRate: m.engagementRate,
      topic: m.topic || "unknown",
    }));

  const underperforming = sorted.slice(-Math.ceil(sorted.length * 0.25));
  const underperformingPatterns = identifyUnderperformingPatterns(underperforming);

  const confidenceScore = calculateConfidence(withRealMetrics.length, analyzed.length);

  const dna: PerformanceDNA = {
    topicScores,
    hookScores,
    formatScores,
    structureScores,
    lengthScores,
    timingScores,
    avgEngagementRate: avgEngagement,
    topPerformingPosts,
    underperformingPatterns,
    confidenceScore,
    sampleSize: withRealMetrics.length,
  };

  await storePerformanceDNA(userId, dna);
  return dna;
}

/**
 * Get stored Performance DNA or analyze fresh.
 */
export async function getPerformanceDNA(userId: string): Promise<PerformanceDNA> {
  const [stored] = await sql`
    SELECT * FROM performance_dna WHERE "userId" = ${userId} LIMIT 1
  `;

  if (stored) {
    return {
      topicScores: (stored.topicScores as any) || {},
      hookScores: (stored.hookScores as any) || {},
      formatScores: (stored.formatScores as any) || {},
      structureScores: (stored.structureScores as any) || {},
      lengthScores: (stored.lengthScores as any) || {},
      timingScores: (stored.timingScores as any) || {},
      avgEngagementRate: stored.avgEngagementRate || 0,
      topPerformingPosts: (stored.topPerformingPosts as any) || [],
      underperformingPatterns: (stored.underperformingPatterns as any) || [],
      confidenceScore: stored.confidenceScore || 0,
      sampleSize: stored.sampleSize || 0,
    };
  }

  return analyzePerformanceDNA(userId);
}

// ── Helpers ──────────────────────────────────────────────

function detectHookType(firstLine: string): string {
  const lower = firstLine.toLowerCase();
  if (lower.startsWith("i ") || lower.startsWith("my ") || lower.startsWith("when i ")) return "personal_story";
  if (firstLine.endsWith("?")) return "question";
  if (lower.startsWith("stop ") || lower.startsWith("don't ") || lower.startsWith("never ")) return "contrarian";
  if (/\d+\s/.test(firstLine)) return "number_list";
  if (lower.startsWith("here's") || lower.startsWith("this is")) return "direct_statement";
  if (lower.includes("most people") || lower.includes("everyone")) return "strong_opinion";
  return "curiosity_gap";
}

function detectStructure(content: string): string {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 3) return "short_form";

  const hasQuestion = lines.some((l) => l.endsWith("?"));
  const hasList = lines.some((l) => /^\d+[.)]\s/.test(l.trim()) || /^[-•]\s/.test(l.trim()));
  const hasCTA = lines.some((l) => /comment|share|what do you|thoughts\?/i.test(l));

  if (hasList && hasCTA) return "list_with_cta";
  if (hasQuestion && hasCTA) return "question_answer_cta";
  if (hasList) return "listicle";
  if (lines.length > 5) return "narrative";

  return "hook_body_cta";
}

function calculateDimensionScores(
  metrics: AnalyzedPost[],
  dimension: keyof Pick<AnalyzedPost, "topic" | "hookType" | "format" | "structure" | "length">,
  topThreshold: number
): Record<string, number> {
  const groups: Record<string, number[]> = {};

  for (const m of metrics) {
    const key = String(m[dimension] || "unknown");
    if (!groups[key]) groups[key] = [];
    groups[key].push(m.engagementRate);
  }

  const scores: Record<string, number> = {};
  for (const [key, rates] of Object.entries(groups)) {
    const avg = rates.reduce((s, r) => s + r, 0) / rates.length;
    const aboveThreshold = rates.filter((r) => r >= topThreshold).length;
    scores[key] = Math.round((avg * 60 + (aboveThreshold / rates.length) * 40) * 100) / 100;
  }

  return scores;
}

function calculateTimingScores(
  metrics: AnalyzedPost[],
  _topThreshold: number
): Record<string, { day: number; hour: number; score: number }> {
  const timing: Record<string, { day: number; hour: number; scores: number[] }> = {};

  for (const m of metrics) {
    const key = `${m.dayOfWeek}_${m.hourOfDay}`;
    if (!timing[key]) timing[key] = { day: m.dayOfWeek, hour: m.hourOfDay, scores: [] };
    timing[key].scores.push(m.engagementRate);
  }

  const result: Record<string, { day: number; hour: number; score: number }> = {};
  for (const [key, data] of Object.entries(timing)) {
    const avg = data.scores.reduce((s, r) => s + r, 0) / data.scores.length;
    result[key] = { day: data.day, hour: data.hour, score: Math.round(avg * 1000) / 1000 };
  }

  return result;
}

function identifyUnderperformingPatterns(posts: AnalyzedPost[]): string[] {
  const patterns: string[] = [];

  const lowHookTypes = posts.map((p) => p.hookType);
  const hookCounts = lowHookTypes.reduce((acc, h) => {
    acc[h] = (acc[h] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  for (const [hook, count] of Object.entries(hookCounts)) {
    if (count >= 2) patterns.push(`Avoid ${hook} hooks in this context`);
  }

  return patterns;
}

function getPercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * percentile) - 1;
  return sorted[Math.max(0, idx)];
}

function calculateConfidence(measuredPosts: number, totalPosts: number): number {
  if (measuredPosts < 3) return 0.2;
  if (measuredPosts < 10) return 0.5;
  if (measuredPosts < 25) return 0.7;
  if (measuredPosts < 50) return 0.85;
  void totalPosts;
  return 0.95;
}

function getEmptyPerformanceDNA(): PerformanceDNA {
  return {
    topicScores: {},
    hookScores: {},
    formatScores: {},
    structureScores: {},
    lengthScores: {},
    timingScores: {},
    avgEngagementRate: 0,
    topPerformingPosts: [],
    underperformingPatterns: [],
    confidenceScore: 0.1,
    sampleSize: 0,
  };
}

async function deleteStoredDNA(userId: string): Promise<void> {
  await sql`DELETE FROM performance_dna WHERE "userId" = ${userId}`;
}

async function storePerformanceDNA(userId: string, dna: PerformanceDNA): Promise<void> {
  await sql`
    INSERT INTO performance_dna (
      id, "userId", "topicScores", "hookScores", "formatScores", "structureScores",
      "lengthScores", "timingScores", "avgEngagementRate", "topPerformingPosts",
      "underperformingPatterns", "confidenceScore", "sampleSize", "lastAnalyzed", "updatedAt"
    ) VALUES (
      ${crypto.randomUUID()}, ${userId}, ${JSON.stringify(dna.topicScores)}::jsonb, ${JSON.stringify(dna.hookScores)}::jsonb,
      ${JSON.stringify(dna.formatScores)}::jsonb, ${JSON.stringify(dna.structureScores)}::jsonb,
      ${JSON.stringify(dna.lengthScores)}::jsonb, ${JSON.stringify(dna.timingScores)}::jsonb,
      ${dna.avgEngagementRate}, ${JSON.stringify(dna.topPerformingPosts)}::jsonb,
      ${JSON.stringify(dna.underperformingPatterns)}::jsonb, ${dna.confidenceScore},
      ${dna.sampleSize}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("userId") DO UPDATE SET
      "topicScores" = EXCLUDED."topicScores",
      "hookScores" = EXCLUDED."hookScores",
      "formatScores" = EXCLUDED."formatScores",
      "structureScores" = EXCLUDED."structureScores",
      "lengthScores" = EXCLUDED."lengthScores",
      "timingScores" = EXCLUDED."timingScores",
      "avgEngagementRate" = EXCLUDED."avgEngagementRate",
      "topPerformingPosts" = EXCLUDED."topPerformingPosts",
      "underperformingPatterns" = EXCLUDED."underperformingPatterns",
      "confidenceScore" = EXCLUDED."confidenceScore",
      "sampleSize" = EXCLUDED."sampleSize",
      "lastAnalyzed" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}
