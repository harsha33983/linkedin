/**
 * DNA Orchestrator
 *
 * Combines all 4 intelligence layers into a single DNA profile:
 * 1. Voice DNA — How does this person write?
 * 2. Performance DNA — What works for this person?
 * 3. Audience DNA — What does their audience respond to?
 * 4. Trend DNA — What is relevant right now?
 *
 * Also implements the learning loop:
 * LinkedIn → Impressions → Engagement → DNA Updates
 */

import { sql } from "@/lib/db";
import { getPerformanceDNA, analyzePerformanceDNA } from "./performance";
import { getAudienceDNA, analyzeAudienceDNA } from "./audience";
import { getTrendDNA, analyzeTrendDNA } from "./trend";
import { formatNLPProfileForPrompt } from "@/lib/voice/nlp-analyzer";

export interface FullDNAProfile {
  voice: any;           // From existing voice_profiles table
  performance: any;     // From performance_dna table
  audience: any;        // From audience_dna table
  trend: any;           // From trend_dna table
  combinedConfidence: number;
  lastUpdated: string;
}

/**
 * Get the complete DNA profile for a user.
 * Fetches all 4 layers and combines them.
 */
export async function getFullDNAProfile(userId: string): Promise<FullDNAProfile> {
  // Fetch all 4 layers in parallel
  const [voice, performance, audience, trend] = await Promise.all([
    getVoiceDNA(userId),
    getPerformanceDNA(userId),
    getAudienceDNA(userId),
    getTrendDNA(userId),
  ]);

  // Calculate combined confidence
  const confidences = [
    voice?.confidenceScore || 0,
    performance?.confidenceScore || 0,
    audience?.confidenceScore || 0,
    trend?.freshnessScore || 0,
  ];
  const combinedConfidence = confidences.reduce((s, c) => s + c, 0) / confidences.length;

  return {
    voice,
    performance,
    audience,
    trend,
    combinedConfidence,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Refresh all DNA layers for a user.
 * Called after new posts are published or LinkedIn data is received.
 */
export async function refreshAllDNA(userId: string): Promise<FullDNAProfile> {
  const [voice, performance, audience, trend] = await Promise.all([
    getVoiceDNA(userId),
    analyzePerformanceDNA(userId),
    analyzeAudienceDNA(userId),
    analyzeTrendDNA(userId),
  ]);

  // Store a snapshot for historical tracking
  await storeDNASnapshot(userId, {
    voice,
    performance,
    audience,
    trend,
  });

  const confidences = [
    voice?.confidenceScore || 0,
    performance?.confidenceScore || 0,
    audience?.confidenceScore || 0,
    trend?.freshnessScore || 0,
  ];

  return {
    voice,
    performance,
    audience,
    trend,
    combinedConfidence: confidences.reduce((s, c) => s + c, 0) / confidences.length,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * The Learning Loop:
 * When LinkedIn data comes in (impressions, engagement),
 * update the DNA to learn what worked.
 */
export async function processLinkedInData(
  userId: string,
  postId: string,
  linkedinData: {
    impressions: number;
    likes: number;
    comments: number;
    reposts: number;
    saves: number;
  }
): Promise<void> {
  // Store the LinkedIn metrics — merged under publishingResponse.metrics so the
  // canonical shape stays { impressions, likes, comments, reposts, saves }.
  const engagementRate =
    linkedinData.impressions > 0
      ? (linkedinData.likes + linkedinData.comments + linkedinData.reposts + linkedinData.saves) /
        linkedinData.impressions
      : 0;

  const [existing] = await sql`SELECT "publishingResponse" FROM posts WHERE id = ${postId} LIMIT 1`;
  const prev = (existing?.publishingResponse as any) || {};
  const metrics = {
    impressions: linkedinData.impressions,
    likes: linkedinData.likes,
    comments: linkedinData.comments,
    reposts: linkedinData.reposts,
    saves: linkedinData.saves,
    source: "linkedin",
    fetchedAt: new Date().toISOString(),
  };

  await sql`
    UPDATE posts SET
      "publishingResponse" = ${JSON.stringify({ ...prev, metrics })}::jsonb,
      "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE id = ${postId}
  `;

  // Re-analyze Performance DNA with new data
  await analyzePerformanceDNA(userId);

  // Re-analyze Audience DNA with new data
  await analyzeAudienceDNA(userId);

  // Store snapshot for learning
  await storeDNASnapshot(userId, {
    trigger: "linkedin_data",
    postId,
    engagementRate,
  });

  console.log(`[DNA Learning] Updated DNA for user ${userId} after LinkedIn data for post ${postId}`);
}

/**
 * Get the voice DNA from the existing voice_profiles table.
 */
async function getVoiceDNA(userId: string) {
  const [voice] = await sql`
    SELECT * FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1
  `;
  return voice || null;
}

/**
 * Store a DNA snapshot for historical tracking.
 */
async function storeDNASnapshot(userId: string, data: any): Promise<void> {
  await sql`
    INSERT INTO dna_snapshots (id, "userId", "snapshotType", "data", "trigger")
    VALUES (${crypto.randomUUID()}, ${userId}, 'full', ${JSON.stringify(data)}::jsonb, ${data.trigger || 'scheduled'})
  `;
}

/**
 * Format the full DNA profile into a prompt-ready string for the AI Growth Engine.
 */
export function formatDNAForPrompt(dna: FullDNAProfile): string {
  const sections: string[] = [];

  // Voice DNA (basic)
  if (dna.voice) {
    const tone = typeof dna.voice.tone === "object" && dna.voice.tone?.primary
      ? `${dna.voice.tone.primary}${dna.voice.tone.secondary ? ", " + dna.voice.tone.secondary : ""}`
      : String(dna.voice.tone || "professional");

    sections.push(`VOICE DNA (confidence: ${Math.round((dna.voice.confidenceScore || 0) * 100)}%):
- Tone: ${tone}
- Sentence style: ${dna.voice.sentenceStyle || "medium"}
- Paragraph style: ${dna.voice.paragraphStyle || "short_blocks"}
- Hook patterns: ${JSON.stringify(dna.voice.hookPatterns || {})}
- CTA style: ${dna.voice.ctaStyle || "question_based"}
- Emoji usage: ${dna.voice.emojiUsage || "minimal"}
- Words to avoid: ${JSON.stringify(dna.voice.wordsToAvoid || [])}`);

    // NLP Deep Profile (if available)
    if (dna.voice.nlpProfile) {
      sections.push(formatNLPProfileForPrompt(dna.voice.nlpProfile as any));
    }
  }

  // Performance DNA
  if (dna.performance && dna.performance.sampleSize > 0) {
    const topTopics = Object.entries(dna.performance.topicScores || {})
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([topic, score]) => `${topic} (${score})`)
      .join(", ");

    const topHooks = Object.entries(dna.performance.hookScores || {})
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([hook, score]) => `${hook} (${score})`)
      .join(", ");

    sections.push(`PERFORMANCE DNA (confidence: ${Math.round(dna.performance.confidenceScore * 100)}%, samples: ${dna.performance.sampleSize}):
- Top topics: ${topTopics || "Insufficient data"}
- Top hooks: ${topHooks || "Insufficient data"}
- Avg engagement rate: ${(dna.performance.avgEngagementRate * 100).toFixed(1)}%
- Underperforming patterns: ${(dna.performance.underperformingPatterns || []).join("; ") || "None identified"}`);
  }

  // Audience DNA
  if (dna.audience && dna.audience.sampleSize > 0) {
    sections.push(`AUDIENCE DNA (confidence: ${Math.round(dna.audience.confidenceScore * 100)}%, samples: ${dna.audience.sampleSize}):
- Engagement style: ${dna.audience.audienceProfile?.engagementStyle || "unknown"}
- Primary interests: ${(dna.audience.audienceProfile?.primaryInterests || []).join(", ") || "Unknown"}
- Share triggers: ${(dna.audience.shareTriggers || []).join("; ") || "Unknown"}
- Avg impressions: ${Math.round(dna.audience.avgImpressions)}
- Avg comments: ${Math.round(dna.audience.avgComments)}`);
  }

  // Trend DNA
  if (dna.trend && dna.trend.activeTrends.length > 0) {
    const topTrends = dna.trend.activeTrends
      .slice(0, 5)
      .map((t: any) => `${t.topic} (relevance: ${t.relevance}, strength: ${t.trendStrength}/10)`)
      .join("\n  ");

    sections.push(`TREND DNA (freshness: ${Math.round(dna.trend.freshnessScore * 100)}%):
- Active trends:
  ${topTrends}
- Evergreen topics: ${(dna.trend.evergreenTopics || []).join(", ") || "None identified"}
- Seasonal context: ${JSON.stringify(dna.trend.seasonalPatterns || {})}`);
  }

  return sections.join("\n\n");
}
