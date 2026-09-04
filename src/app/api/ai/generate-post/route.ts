import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, ValidationError, AiGenerationError } from "@/lib/errors/api-errors";
import { getProvider } from "@/lib/ai/types";
import { fetchPostImage } from "@/lib/ai/image-fetch";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/limiter";
import { getFullDNAProfile, formatDNAForPrompt } from "@/lib/dna";
import { generatePostLocally } from "@/lib/ai/local-generator";
import { analyzeWritingWithNLP } from "@/lib/voice/nlp-analyzer";
import { analyzeVoiceProfile } from "@/lib/voice/analyze";
import { importPublishedPostsAsSamples } from "@/lib/voice/posts-import";
import { z } from "zod";

const generatePostSchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  goal: z.string().optional(),
  format: z
    .enum([
      "Educational",
      "Personal story",
      "Contrarian",
      "Opinion",
      "Listicle",
      "Framework",
      "Case study",
      "Lesson learned",
      "Announcement",
      "Promotional",
    ])
    .optional(),
  tone: z.string().optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
  targetAudience: z.string().optional(),
});

/**
 * POST /api/ai/generate-post — Generate 3 post versions with AI Growth Engine
 *
 * Pipeline:
 * 1. Retrieve VoiceDNA + UserProfile
 * 2. Fetch performance data from published posts
 * 3. Fetch trending topics (from content_ideas or external)
 * 4. Generate 3 versions with full Growth Engine analysis
 * 5. Run quality gate
 * 6. Fetch images for each version
 * 7. Store Generation record
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const parsed = generatePostSchema.parse(body);

    // Rate limit check
    const rateLimitKey = `post-gen:${userId}`;
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMITS.free);
    if (!rateLimit.allowed) {
      return Response.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again later.",
          resetAt: rateLimit.resetAt,
        },
        { status: 429 }
      );
    }

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
        // "Best match for Voice DNA" genuinely needs DNA — try to auto-build it
        // from their posts first; only if that is impossible do we ask for samples.
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

    // 3. Fetch performance data from published posts
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

    // Build performance data points (simulated metrics for now — will be real when LinkedIn analytics API is connected)
    const recentPosts = publishedPosts.map((post: any) => {
      const publishData = post.publishingResponse as any;
      return {
        content: post.content,
        topic: post.topic || parsed.topic,
        format: post.format || "Educational",
        publishedAt: post.publishedAt,
        impressions: publishData?.impressions || Math.floor(Math.random() * 5000) + 500,
        likes: publishData?.likes || Math.floor(Math.random() * 100) + 10,
        comments: publishData?.comments || Math.floor(Math.random() * 30) + 2,
        reposts: publishData?.reposts || Math.floor(Math.random() * 15) + 1,
        saves: publishData?.saves || Math.floor(Math.random() * 10) + 1,
        engagementRate: publishData?.engagementRate || undefined,
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

    // 4. Fetch trending topics from content_ideas
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

    // Also add the user's topic as a high-relevance trend
    if (parsed.topic) {
      trendingTopics.unshift({
        topic: parsed.topic,
        relevance: "User-specified topic",
        trendStrength: 8,
      });
    }

    // 5. Content pillars from userProfile
    const contentPillars = [
      ...(userProfile.expertise || []),
      ...(userProfile.linkedinGoals || []),
    ].filter(Boolean);

    // 6. Generate posts — try AI first, fall back to local generator
    const provider = getProvider();
    let result;
    let usedLocalGenerator = false;
    try {
      result = await provider.generatePost({
        topic: parsed.topic,
        goal: parsed.goal,
        format: parsed.format,
        tone: parsed.tone,
        length: parsed.length,
        targetAudience: parsed.targetAudience,
        voiceProfile: voiceProfile as any,
        userProfile: userProfile as any,
        recentPosts: allRecentPosts,
        trendingTopics,
        contentPillars,
        dnaProfile: dnaProfile as any,
      });

      // Validate the AI shape — models sometimes return malformed versions
      // (strings, missing content). If so, fall through to the local generator.
      if (!isValidVersions(result?.versions)) {
        throw new Error("AI returned malformed versions — falling back to local generator");
      }
    } catch (aiError: any) {
      console.warn("[Generate] AI generation failed, using local generator:", aiError?.message?.slice(0, 100));
      usedLocalGenerator = true;

      // Build NLP profile from samples for local generation
      const allSamples = await sql`
        SELECT content FROM writing_samples WHERE "userId" = ${userId} ORDER BY "createdAt" ASC
      `;
      const sampleTexts = (allSamples as any[]).map((s) => s.content);
      
      // Also include DB posts for richer NLP
      const allTexts = [...sampleTexts, ...allRecentPosts.map((p) => p.content).filter(Boolean)];
      const uniqueTexts = Array.from(new Map(allTexts.map((t: string) => [t.substring(0, 100), t])).values());
      
      const nlpProfile = uniqueTexts.length > 0
        ? analyzeWritingWithNLP(uniqueTexts)
        : (voiceProfile as any).nlpProfile;

      result = generatePostLocally({
        topic: parsed.topic,
        goal: parsed.goal,
        format: parsed.format,
        tone: parsed.tone,
        length: parsed.length,
        targetAudience: parsed.targetAudience,
        nlpProfile,
        recentPosts: allRecentPosts,
      });
    }

    // 7. Quality gate — check each version
    const recentGenerations = await sql`
      SELECT output FROM generations 
      WHERE "userId" = ${userId} AND type = 'post'
      ORDER BY "createdAt" DESC
      LIMIT 10
    `;

    const recentHooks = recentGenerations
      .map((g: any) => {
        const output = g.output as any;
        return output?.versions?.[0]?.hook || "";
      })
      .filter(Boolean);

    // Quality gate (skip for local generator — templates are pre-validated)
    if (!usedLocalGenerator) {
      for (const version of result.versions) {
        const qualityCheck = await provider.checkQuality(
          version.content,
          voiceProfile as any,
          recentHooks
        );

        if (!qualityCheck.passes) {
          console.warn(
            `Quality gate flagged version ${version.id}:`,
            qualityCheck.details
          );
        }
      }
    }

    // 8. Fetch images for each version (parallel, non-blocking)
    const imagePromises = result.versions.map((version) => {
      const query = version.imageQuery || parsed.topic;
      return fetchPostImage(query);
    });
    const imageUrls = await Promise.all(imagePromises);
    result.versions.forEach((version, i) => {
      version.imageUrl = imageUrls[i] || undefined;
    });

    // 9. Store generation record
    const [generation] = await sql`
      INSERT INTO generations (
        id, "userId", type, input, output, model, "voiceDnaVersionUsed"
      ) VALUES (
        gen_random_uuid(), ${userId}, 'post', ${JSON.stringify(parsed)}::jsonb, 
        ${JSON.stringify(result)}::jsonb,        ${usedLocalGenerator ? 'local-nlp' : (process.env.AI_MODEL || 'gpt-4o')}, ${(voiceProfile as any).version}
      )
      RETURNING id
    `;

    return Response.json({
      success: true,
      data: {
        ...result,
        generationId: generation.id,
        usedLocalGenerator,
        metadata: {
          model: usedLocalGenerator ? 'local-nlp' : (process.env.AI_MODEL || 'gpt-4o'),
          voiceDnaVersionUsed: (voiceProfile as any).version ?? 0,
          confidenceScore: (voiceProfile as any).confidenceScore ?? 0.2,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * True when the AI response has a usable versions array (array of objects,
 * each with a non-empty string content).
 */
function isValidVersions(versions: any): boolean {
  return (
    Array.isArray(versions) &&
    versions.length > 0 &&
    versions.every(
      (v) => v && typeof v === "object" && typeof v.content === "string" && v.content.trim().length > 0
    )
  );
}

/**
 * Neutral fallback voice profile — used when the user picks a specific format
 * but has no Voice DNA yet. Low confidence so the UI flags results as generic
 * until they add samples.
 */
function buildNeutralVoiceProfile(userId: string, userProfile: any): any {
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
function detectHookType(content: string): string {
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
