/**
 * Audience DNA Analyzer
 *
 * Analyzes what the user's audience responds to:
 * - Which topics get the most comments
 * - Which hooks drive shares
 * - Which times get the most impressions
 * - What themes appear in comments
 * - What triggers saves/bookmarks
 *
 * IMPORTANT: All metrics are REAL — read from posts.publishingResponse.metrics
 * (populated by the LinkedIn analytics sync). Posts without measured
 * engagement never contribute fake numbers; with no real data the DNA is
 * honestly empty (sampleSize 0).
 *
 * Output: An "Audience DNA" that tells the writer what their audience wants.
 */

import { sql } from "@/lib/db";
import { readPostMetrics, type PostMetrics } from "@/lib/linkedin/metrics";

interface AudienceDNA {
  audienceProfile: {
    primaryInterests: string[];
    engagementStyle: string; // "lurkers" | "commenters" | "sharers" | "savers"
    responsePatterns: string[];
  };
  responsePatterns: {
    questionPosts: number;
    storyPosts: number;
    listPosts: number;
    opinionPosts: number;
  };
  engagementByTime: Record<string, number>;
  engagementByDay: Record<string, number>;
  commentThemes: string[];
  shareTriggers: string[];
  avgImpressions: number;
  avgComments: number;
  avgShares: number;
  confidenceScore: number;
  sampleSize: number;
}

interface MeasuredPost extends PostMetrics {
  content: string;
  topic: string | null;
  format: string | null;
  publishedAt: string | null;
  createdAt: string | null;
}

/**
 * Analyze audience behavior from published posts with REAL metrics.
 */
export async function analyzeAudienceDNA(userId: string): Promise<AudienceDNA> {
  const posts = await sql`
    SELECT content, topic, format, "publishingResponse", "publishedAt", "createdAt"
    FROM posts
    WHERE "userId" = ${userId} AND status = 'PUBLISHED'
    ORDER BY "publishedAt" ASC
  `;

  if (posts.length === 0) {
    await deleteStoredDNA(userId);
    return getEmptyAudienceDNA();
  }

  const measured = (posts as any[])
    .map((post): MeasuredPost => {
      const metrics = readPostMetrics(post.publishingResponse);
      return {
        ...metrics,
        content: post.content || "",
        topic: post.topic,
        format: post.format,
        publishedAt: post.publishedAt,
        createdAt: post.createdAt,
      };
    })
    .filter((p) => p.real);

  // No real engagement measured yet → nothing to learn. Remove stale rows.
  if (measured.length === 0) {
    await deleteStoredDNA(userId);
    return getEmptyAudienceDNA();
  }

  let totalImpressions = 0;
  let totalComments = 0;
  let totalShares = 0;
  const byTime: Record<string, number[]> = {};
  const byDay: Record<string, number[]> = {};
  const hookResponses: Record<string, number[]> = {};

  for (const post of measured) {
    totalImpressions += post.impressions;
    totalComments += post.comments;
    totalShares += post.reposts;

    const pubDate = post.publishedAt ? new Date(post.publishedAt) : new Date(post.createdAt || "");
    const hour = pubDate.getHours();
    const day = pubDate.getDay();

    const timeKey = `${hour}:00`;
    if (!byTime[timeKey]) byTime[timeKey] = [];
    byTime[timeKey].push(post.comments + post.reposts);

    const dayKey = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day];
    if (!byDay[dayKey]) byDay[dayKey] = [];
    byDay[dayKey].push(post.comments + post.reposts);

    const firstLine = post.content.split("\n")[0] || "";
    const hookType = detectHookType(firstLine);
    if (!hookResponses[hookType]) hookResponses[hookType] = [];
    hookResponses[hookType].push(post.comments + post.reposts);
  }

  const n = measured.length;
  const avgImpressions = totalImpressions / n;
  const avgComments = totalComments / n;
  const avgShares = totalShares / n;

  const engagementStyle =
    avgComments > 10 ? "commenters" : avgShares > 5 ? "sharers" : avgImpressions > 0 ? "lurkers" : "unknown";

  const shareTriggers = Object.entries(hookResponses)
    .map(([hook, rates]) => ({
      hook,
      avgEngagement: rates.reduce((s, r) => s + r, 0) / rates.length,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 3)
    .map((h) => `${h.hook} hooks drive engagement`);

  const dna: AudienceDNA = {
    audienceProfile: {
      primaryInterests: extractInterests(measured),
      engagementStyle,
      responsePatterns: shareTriggers,
    },
    responsePatterns: {
      questionPosts: averageEngagementByType(hookResponses, "question"),
      storyPosts: averageEngagementByType(hookResponses, "personal_story"),
      listPosts: averageEngagementByType(hookResponses, "number_list"),
      opinionPosts: averageEngagementByType(hookResponses, "strong_opinion"),
    },
    engagementByTime: averageByGroup(byTime),
    engagementByDay: averageByGroup(byDay),
    commentThemes: extractInterests(measured).slice(0, 5),
    shareTriggers,
    avgImpressions,
    avgComments,
    avgShares,
    confidenceScore: calculateConfidence(measured.length),
    sampleSize: measured.length,
  };

  await storeAudienceDNA(userId, dna);
  return dna;
}

export async function getAudienceDNA(userId: string): Promise<AudienceDNA> {
  const [stored] = await sql`
    SELECT * FROM audience_dna WHERE "userId" = ${userId} LIMIT 1
  `;

  if (stored) {
    return {
      audienceProfile: (stored.audienceProfile as any) || {},
      responsePatterns: (stored.responsePatterns as any) || {},
      engagementByTime: (stored.engagementByTime as any) || {},
      engagementByDay: (stored.engagementByDay as any) || {},
      commentThemes: (stored.commentThemes as any) || [],
      shareTriggers: (stored.shareTriggers as any) || [],
      avgImpressions: stored.avgImpressions || 0,
      avgComments: stored.avgComments || 0,
      avgShares: stored.avgShares || 0,
      confidenceScore: stored.confidenceScore || 0,
      sampleSize: stored.sampleSize || 0,
    };
  }

  return analyzeAudienceDNA(userId);
}

// ── Helpers ──────────────────────────────────────────────

function detectHookType(firstLine: string): string {
  const lower = firstLine.toLowerCase();
  if (lower.startsWith("i ") || lower.startsWith("my ")) return "personal_story";
  if (firstLine.endsWith("?")) return "question";
  if (lower.startsWith("stop ") || lower.startsWith("don't ")) return "contrarian";
  if (/\d+\s/.test(firstLine)) return "number_list";
  if (lower.includes("most people") || lower.includes("everyone")) return "strong_opinion";
  return "curiosity_gap";
}

function extractInterests(posts: MeasuredPost[]): string[] {
  const topics = posts.map((p) => p.topic).filter(Boolean);
  const counts: Record<string, number> = {};
  for (const t of topics) {
    counts[t as string] = (counts[t as string] || 0) + 1;
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([t]) => t);
}

function averageByGroup(groups: Record<string, number[]>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, values] of Object.entries(groups)) {
    result[key] = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
  }
  return result;
}

function averageEngagementByType(hookResponses: Record<string, number[]>, type: string): number {
  const values = hookResponses[type] || [];
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function calculateConfidence(sampleSize: number): number {
  if (sampleSize < 3) return 0.15;
  if (sampleSize < 10) return 0.4;
  if (sampleSize < 25) return 0.65;
  return 0.85;
}

function getEmptyAudienceDNA(): AudienceDNA {
  return {
    audienceProfile: { primaryInterests: [], engagementStyle: "unknown", responsePatterns: [] },
    responsePatterns: { questionPosts: 0, storyPosts: 0, listPosts: 0, opinionPosts: 0 },
    engagementByTime: {},
    engagementByDay: {},
    commentThemes: [],
    shareTriggers: [],
    avgImpressions: 0,
    avgComments: 0,
    avgShares: 0,
    confidenceScore: 0.1,
    sampleSize: 0,
  };
}

async function deleteStoredDNA(userId: string): Promise<void> {
  await sql`DELETE FROM audience_dna WHERE "userId" = ${userId}`;
}

async function storeAudienceDNA(userId: string, dna: AudienceDNA): Promise<void> {
  await sql`
    INSERT INTO audience_dna (
      id, "userId", "audienceProfile", "responsePatterns", "engagementByTime",
      "engagementByDay", "commentThemes", "shareTriggers",
      "avgImpressions", "avgComments", "avgShares",
      "confidenceScore", "sampleSize", "lastAnalyzed", "updatedAt"
    ) VALUES (
      ${crypto.randomUUID()}, ${userId}, ${JSON.stringify(dna.audienceProfile)}::jsonb,
      ${JSON.stringify(dna.responsePatterns)}::jsonb,
      ${JSON.stringify(dna.engagementByTime)}::jsonb,
      ${JSON.stringify(dna.engagementByDay)}::jsonb,
      ${JSON.stringify(dna.commentThemes)}::jsonb,
      ${JSON.stringify(dna.shareTriggers)}::jsonb,
      ${dna.avgImpressions}, ${dna.avgComments}, ${dna.avgShares},
      ${dna.confidenceScore}, ${dna.sampleSize}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("userId") DO UPDATE SET
      "audienceProfile" = EXCLUDED."audienceProfile",
      "responsePatterns" = EXCLUDED."responsePatterns",
      "engagementByTime" = EXCLUDED."engagementByTime",
      "engagementByDay" = EXCLUDED."engagementByDay",
      "commentThemes" = EXCLUDED."commentThemes",
      "shareTriggers" = EXCLUDED."shareTriggers",
      "avgImpressions" = EXCLUDED."avgImpressions",
      "avgComments" = EXCLUDED."avgComments",
      "avgShares" = EXCLUDED."avgShares",
      "confidenceScore" = EXCLUDED."confidenceScore",
      "sampleSize" = EXCLUDED."sampleSize",
      "lastAnalyzed" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}
