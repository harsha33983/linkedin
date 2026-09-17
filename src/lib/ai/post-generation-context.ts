import { sql } from "@/lib/db";
import { ValidationError } from "@/lib/errors/api-errors";
import { getFullDNAProfile } from "@/lib/dna";
import { analyzeWritingWithNLP } from "@/lib/voice/nlp-analyzer";
import { analyzeVoiceProfile } from "@/lib/voice/analyze";
import { importPublishedPostsAsSamples } from "@/lib/voice/posts-import";
import { readPostMetrics } from "@/lib/linkedin/metrics";

export interface PostGenParsed {
  topic: string;
  goal?: string;
  format?: string;
  tone?: string;
  length?: "short" | "medium" | "long";
  targetAudience?: string;
}

export interface PostGenerationContext {
  dnaProfile: any;
  userProfile: any;
  voiceProfile: any;
  allRecentPosts: any[];
  trendingTopics: any[];
  contentPillars: string[];
}

/**
 * Build everything the post generator needs: full DNA profile, user profile,
 * resolved Voice DNA (with auto-import of published posts), recent post
 * performance (REAL LinkedIn metrics only — never invented), recent drafts
 * for anti-repetition, trending topics, and content pillars.
 *
 * Shared by /api/ai/generate-post and /api/ai/generate-post/stream so both
 * tiers always see identical inputs.
 */
export async function buildPostGenerationContext(
  userId: string,
  parsed: PostGenParsed
): Promise<PostGenerationContext> {
  // 1. Fetch full DNA profile (Voice + Performance + Audience + Trend)
  const dnaProfile = await getFullDNAProfile(userId);

  // 2. Retrieve UserProfile
  const [userProfile] = await sql`
    SELECT * FROM user_profiles WHERE "userId" = ${userId}
  `;

  if (!userProfile) {
    throw new ValidationError(
      "No profile found. Please complete onboarding first."
    );
  }

  // 3. Resolve Voice DNA
  //
  // Voice DNA is ONLY required when the user asks for "Best match for Voice
  // DNA" (no explicit format). If they picked a concrete format we generate
  // with a neutral default voice so the feature never dead-ends.
  // When DNA is missing we first auto-import the user's own PUBLISHED posts
  // as writing samples, so samples can be built without manual pasting.
  let voiceProfile = dnaProfile.voice;
  const bestMatchMode = !parsed.format;

  if (!voiceProfile) {
    // Auto-import the user's own published posts (no manual add needed).
    const { totalSamples } = await importPublishedPostsAsSamples(userId);

    if (bestMatchMode) {
      if (totalSamples >= 3) {
        try {
          const res = await analyzeVoiceProfile(userId, "auto_build_before_generation");
          voiceProfile = res.voiceProfile || null;
        } catch (buildError: any) {
          console.warn("[Generate] Auto Voice DNA build failed:", buildError?.message?.slice(0, 120));
        }
      }

      if (!voiceProfile) {
        throw new ValidationError(
          "No Voice DNA found. Please add writing samples first — or choose a specific Format below to generate without Voice DNA."
        );
      }
    } else {
      // Explicit format chosen → neutral default voice, low confidence.
      voiceProfile = buildNeutralVoiceProfile(userId, userProfile as any);
    }
  }

  // Keep the resolved voice available to the downstream DNA formatting.
  dnaProfile.voice = voiceProfile;

  // 4. Fetch performance data from published posts (REAL metrics only)
  const publishedPosts = await sql`
    SELECT 
      content, 
      topic, 
      format, 
      "imageUrl",
      "externalPostId",
      "publishedAt",
      "publishingResponse"
    FROM posts 
    WHERE "userId" = ${userId} 
    AND status = 'PUBLISHED'
    ORDER BY "publishedAt" DESC 
    LIMIT 20
  `;

  const recentPosts = publishedPosts.map((post: any) => {
    const m = readPostMetrics(post.publishingResponse);
    return {
      content: post.content,
      topic: post.topic || parsed.topic,
      format: post.format || "Educational",
      publishedAt: post.publishedAt,
      impressions: m.impressions,
      likes: m.likes,
      comments: m.comments,
      reposts: m.reposts,
      saves: m.saves,
      engagementRate: m.real ? m.engagementRate : undefined,
      hasRealMetrics: m.real,
      hookType: detectHookType(post.content),
    };
  });

  // Also include recent drafts for anti-repetition
  const recentDrafts = await sql`
    SELECT content, topic, format, status
    FROM posts 
    WHERE "userId" = ${userId} 
    AND status IN ('DRAFT', 'SCHEDULED')
    AND content IS NOT NULL
    ORDER BY "createdAt" DESC 
    LIMIT 10
  `;

  const allRecentPosts = [
    ...recentPosts,
    ...recentDrafts.map((d: any) => ({
      content: d.content,
      topic: d.topic || parsed.topic,
      format: d.format || "Educational",
      hookType: detectHookType(d.content),
    })),
  ];

  // 5. Fetch trending topics from content_ideas
  const trendingIdeas = await sql`
    SELECT title, description, topic, format, "suggestionReason"
    FROM content_ideas
    WHERE "userId" = ${userId}
    AND status != 'dismissed'
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;

  const trendingTopics = trendingIdeas.map((idea: any) => ({
    topic: idea.topic || idea.title,
    relevance: idea.suggestionReason || "Content pillar",
    trendStrength: 7,
  }));

  // The user's topic is always the highest-relevance "trend"
  if (parsed.topic) {
    trendingTopics.unshift({
      topic: parsed.topic,
      relevance: "User-specified topic",
      trendStrength: 8,
    });
  }

  // 6. Content pillars from userProfile
  const contentPillars = [
    ...(userProfile.expertise || []),
    ...(userProfile.linkedinGoals || []),
  ].filter(Boolean);

  return {
    dnaProfile,
    userProfile,
    voiceProfile,
    allRecentPosts,
    trendingTopics,
    contentPillars,
  };
}

/**
 * Neutral fallback voice profile — used when the user picks a specific format
 * but has no Voice DNA yet. Low confidence so the UI flags results as generic
 * until they add samples.
 */
export function buildNeutralVoiceProfile(userId: string, userProfile: any): any {
  return {
    id: null,
    userId,
    version: 0,
    confidenceScore: 0.2,
    sampleCount: 0,
    userConfirmed: false,
    lastUpdated: new Date().toISOString(),
    tone: ["professional", "direct", "clear"],
    sentenceStyle: "medium",
    paragraphStyle: "medium",
    hookPatterns: [],
    ctaStyle: "question",
    emojiUsage: "low",
    commonTopics: (userProfile?.expertise || []).slice(0, 5),
    wordsToAvoid: [],
    writingPatterns: { voiceArchetype: "the practitioner" },
    sourceWeighting: null,
    metadata: { fallback: "no_voice_dna", reason: "explicit_format_without_dna" },
    nlpProfile: analyzeWritingWithNLP([]),
  };
}

/**
 * Simple hook type detector for performance analysis
 */
export function detectHookType(content: string): string {
  const firstLine = (content || "").split("\n")[0] || "";
  const lower = firstLine.toLowerCase();

  if (lower.startsWith("i ") || lower.startsWith("my ") || lower.startsWith("when i ")) {
    return "personal_story";
  }
  if (firstLine.endsWith("?")) {
    return "question";
  }
  if (lower.startsWith("stop ") || lower.startsWith("don't ") || lower.startsWith("never ")) {
    return "contrarian";
  }
  if (/\d+\s/.test(firstLine)) {
    return "number_list";
  }
  if (lower.startsWith("here's") || lower.startsWith("this is")) {
    return "direct_statement";
  }
  if (lower.includes("most people") || lower.includes("everyone") || lower.includes("nobody")) {
    return "strong_opinion";
  }
  return "curiosity_gap";
}
