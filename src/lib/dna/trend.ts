/**
 * Trend DNA Analyzer
 *
 * Analyzes what is relevant right now:
 * - Active trends in the user's industry
 * - Evergreen topics that always perform
 * - Seasonal patterns
 * - Industry news and events
 * - Competitor content patterns
 *
 * Output: A "Trend DNA" that tells the writer what topics are timely.
 */

import { sql } from "@/lib/db";

interface TrendDNA {
  activeTrends: Array<{
    topic: string;
    relevance: number;
    trendStrength: number;
    source: string;
  }>;
  trendScores: Record<string, number>;
  evergreenTopics: string[];
  seasonalPatterns: Record<string, string[]>;
  industryNews: string[];
  freshnessScore: number;
  lastRefreshed: string;
}

/**
 * Analyze current trends for the user.
 * Combines: content ideas, user expertise, and topic patterns.
 */
export async function analyzeTrendDNA(userId: string): Promise<TrendDNA> {
  // Fetch user's content pillars
  const [userProfile] = await sql`
    SELECT expertise, "linkedinGoals" FROM user_profiles WHERE "userId" = ${userId} LIMIT 1
  `;

  // Fetch content ideas (trending topics the system has suggested)
  const ideas = await sql`
    SELECT title, topic, "suggestionReason", status
    FROM content_ideas 
    WHERE "userId" = ${userId} AND status != 'dismissed'
    ORDER BY "createdAt" DESC LIMIT 20
  `;

  // Fetch recent posts to identify evergreen vs trending
  const recentPosts = await sql`
    SELECT topic, "publishedAt"
    FROM posts 
    WHERE "userId" = ${userId} AND status = 'PUBLISHED'
    ORDER BY "publishedAt" DESC LIMIT 20
  `;

  const expertise = (userProfile?.expertise as string[]) || [];
  const goals = (userProfile?.linkedinGoals as string[]) || [];

  // Build active trends from content ideas
  const activeTrends = ideas.map((idea: any) => ({
    topic: idea.topic || idea.title,
    relevance: calculateRelevance(idea.topic || idea.title, expertise),
    trendStrength: idea.status === "suggested" ? 8 : 6,
    source: idea.suggestionReason || "content_idea",
  }));

  // Identify evergreen topics (topics that appear repeatedly)
  const topicFrequency: Record<string, number> = {};
  for (const post of recentPosts) {
    if (post.topic) {
      topicFrequency[post.topic] = (topicFrequency[post.topic] || 0) + 1;
    }
  }
  const evergreenTopics = Object.entries(topicFrequency)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([topic]) => topic);

  // Build trend scores
  const trendScores: Record<string, number> = {};
  for (const trend of activeTrends) {
    trendScores[trend.topic] = trend.relevance * 0.6 + trend.trendStrength * 0.4;
  }

  // Seasonal patterns (basic)
  const now = new Date();
  const month = now.getMonth();
  const seasonalPatterns: Record<string, string[]> = {};
  if (month >= 0 && month <= 2) seasonalPatterns["Q1"] = ["new year goals", "planning", "fresh starts"];
  if (month >= 3 && month <= 5) seasonalPatterns["Q2"] = ["growth", "momentum", "mid-year review"];
  if (month >= 6 && month <= 8) seasonalPatterns["Q3"] = ["reflection", "learning", "second half"];
  if (month >= 9 && month <= 11) seasonalPatterns["Q4"] = ["year in review", "gratitude", "predictions"];

  const dna: TrendDNA = {
    activeTrends: activeTrends.slice(0, 10),
    trendScores,
    evergreenTopics,
    seasonalPatterns,
    industryNews: extractIndustryNews(activeTrends),
    freshnessScore: calculateFreshness(activeTrends),
    lastRefreshed: new Date().toISOString(),
  };

  await storeTrendDNA(userId, dna);
  return dna;
}

export async function getTrendDNA(userId: string): Promise<TrendDNA> {
  const [stored] = await sql`
    SELECT * FROM trend_dna WHERE "userId" = ${userId} LIMIT 1
  `;

  if (stored) {
    const lastRefreshed = new Date(stored.lastRefreshed);
    const hoursSinceRefresh = (Date.now() - lastRefreshed.getTime()) / (1000 * 60 * 60);

    // Refresh if older than 24 hours
    if (hoursSinceRefresh < 24) {
      return {
        activeTrends: (stored.activeTrends as any) || [],
        trendScores: (stored.trendScores as any) || {},
        evergreenTopics: (stored.evergreenTopics as any) || [],
        seasonalPatterns: (stored.seasonalPatterns as any) || {},
        industryNews: (stored.industryNews as any) || [],
        freshnessScore: stored.freshnessScore || 0,
        lastRefreshed: stored.lastRefreshed,
      };
    }
  }

  return analyzeTrendDNA(userId);
}

// ── Helpers ──────────────────────────────────────────────

function calculateRelevance(topic: string, expertise: string[]): number {
  if (!topic) return 0.3;
  const topicLower = topic.toLowerCase();
  for (const exp of expertise) {
    if (topicLower.includes(exp.toLowerCase())) return 0.9;
  }
  return 0.5;
}

function calculateFreshness(trends: TrendDNA["activeTrends"]): number {
  if (trends.length === 0) return 0.1;
  const avgStrength = trends.reduce((s, t) => s + t.trendStrength, 0) / trends.length;
  return Math.min(avgStrength / 10, 1);
}

function extractIndustryNews(trends: TrendDNA["activeTrends"]): string[] {
  return trends.slice(0, 3).map((t) => `${t.topic} — trending with strength ${t.trendStrength}/10`);
}

async function storeTrendDNA(userId: string, dna: TrendDNA): Promise<void> {
  await sql`
    INSERT INTO trend_dna (
      id, "userId", "activeTrends", "trendScores", "evergreenTopics",
      "seasonalPatterns", "industryNews", "freshnessScore", "lastRefreshed", "updatedAt"
    ) VALUES (
      ${crypto.randomUUID()}, ${userId}, ${JSON.stringify(dna.activeTrends)}::jsonb,
      ${JSON.stringify(dna.trendScores)}::jsonb,
      ${JSON.stringify(dna.evergreenTopics)}::jsonb,
      ${JSON.stringify(dna.seasonalPatterns)}::jsonb,
      ${JSON.stringify(dna.industryNews)}::jsonb,
      ${dna.freshnessScore}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("userId") DO UPDATE SET
      "activeTrends" = EXCLUDED."activeTrends",
      "trendScores" = EXCLUDED."trendScores",
      "evergreenTopics" = EXCLUDED."evergreenTopics",
      "seasonalPatterns" = EXCLUDED."seasonalPatterns",
      "industryNews" = EXCLUDED."industryNews",
      "freshnessScore" = EXCLUDED."freshnessScore",
      "lastRefreshed" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}
