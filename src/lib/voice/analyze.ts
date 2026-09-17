/**
 * Voice DNA Analysis Service
 *
 * Shared core for Voice DNA generation / reanalysis.
 * Used by:
 *  - POST /api/voice/analyze (manual reanalyze)
 *  - The queue dispatcher (auto reanalysis when samples are added/deleted)
 *
 * Runs NLP analysis on ALL user content (writing samples + DB posts) and
 * optionally enhances it with AI. Falls back to NLP-only when the AI
 * provider is unavailable or rate-limited.
 */

import { sql } from "@/lib/db";
import { withFailover } from "@/lib/ai/types";
import { computeConfidenceScore } from "@/lib/voice/confidence";
import { DEFAULT_SOURCE_WEIGHTS } from "@/lib/voice/weighting";
import { analyzeWritingWithNLP } from "@/lib/voice/nlp-analyzer";
import { importPublishedPostsAsSamples } from "@/lib/voice/posts-import";

export interface VoiceAnalysisPayload {
  voiceProfile: any;
  nlpProfile: any;
  usedNlpOnly: boolean;
  confidenceTier: "Emerging" | "Solid" | "Strong";
  sampleCount: number;
  triggerReason: string;
}

/**
 * Analyze all writing samples + DB posts for a user and upsert their Voice DNA.
 * Throws on failure so callers decide how to surface errors.
 */
export async function analyzeVoiceProfile(
  userId: string,
  triggerReason = "auto_reanalysis"
): Promise<VoiceAnalysisPayload> {
  // Auto-import the user's own PUBLISHED posts as writing samples so users
  // never have to paste their own published content by hand.
  await importPublishedPostsAsSamples(userId);

  // Fetch all writing samples
  const samples = await sql`SELECT * FROM writing_samples WHERE "userId" = ${userId} ORDER BY "createdAt" ASC`;

  if (samples.length < 3) {
    const err: any = new Error(
      "At least 3 writing samples are required for Voice DNA analysis."
    );
    err.status = 400;
    throw err;
  }

  // Apply source weighting — send weighted sample text
  const weightedSamples = samples.map((s: any) => ({
    content: s.content,
    sourceType: s.source || "other",
    weight: DEFAULT_SOURCE_WEIGHTS[s.source || "other"] || 0.4,
  }));

  // Sort by weight (highest first) — AI sees highest-quality samples first
  weightedSamples.sort((a: any, b: any) => b.weight - a.weight);

  const sampleTexts = weightedSamples.map((s: any) => s.content);

  // Also fetch all user posts from DB for richer NLP analysis
  const dbPosts = await sql`
    SELECT content FROM posts 
    WHERE "userId" = ${userId} 
    AND content IS NOT NULL 
    AND length(content) > 20
    ORDER BY "createdAt" DESC 
    LIMIT 50
  `;
  const allTextsForNLP = [...sampleTexts, ...(dbPosts as any[]).map((p) => p.content)];
  // Deduplicate by prefix
  const uniqueTextsForNLP = Array.from(new Map(allTextsForNLP.map((t: string) => [t.substring(0, 100), t])).values());

  // Get current voice profile for versioning
  const [currentProfile] = await sql`SELECT * FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1`;

  // Snapshot current version before updating
  if (currentProfile) {
    const [maxVersion] = await sql`
      SELECT version FROM voice_profile_versions WHERE "userId" = ${userId} ORDER BY version DESC LIMIT 1
    `;

    const snapshotVersion = (maxVersion?.version || 0) + 1;

    await sql`
      INSERT INTO voice_profile_versions (
        id, "userId", version, snapshot, "triggerReason", "createdAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, ${snapshotVersion}, 
        ${JSON.stringify({
          tone: currentProfile.tone,
          sentenceStyle: currentProfile.sentenceStyle,
          paragraphStyle: currentProfile.paragraphStyle,
          hookPatterns: currentProfile.hookPatterns,
          ctaStyle: currentProfile.ctaStyle,
          emojiUsage: currentProfile.emojiUsage,
          commonTopics: currentProfile.commonTopics,
          wordsToAvoid: currentProfile.wordsToAvoid,
          writingPatterns: currentProfile.writingPatterns,
          confidenceScore: currentProfile.confidenceScore,
          sampleCount: currentProfile.sampleCount,
          userConfirmed: currentProfile.userConfirmed,
        })}::jsonb, 
        ${triggerReason}, CURRENT_TIMESTAMP
      )
    `;
  }

  // Run NLP analysis on ALL content (writing samples + all DB posts)
  const nlpProfile = analyzeWritingWithNLP(uniqueTextsForNLP);
  console.log("[NLP] Voice analysis complete:", nlpProfile.tone.voiceArchetype, "|", nlpProfile.consistency.confidenceLevel, "confidence");

  // Try AI analysis (with provider failover; NLP-only as final fallback)
  let analysisResult: any;
  let usedNlpOnly = false;
  try {
    const { result } = await withFailover((provider) =>
      provider.analyzeVoice(sampleTexts, {
        sourceWeighting: DEFAULT_SOURCE_WEIGHTS,
        nlpProfile,
      } as any)
    );
    analysisResult = result;
  } catch (aiError: any) {
    console.warn("[Voice] AI analysis failed, using NLP-only profile:", aiError?.message?.slice(0, 100));
    usedNlpOnly = true;
    // Build a VoiceAnalysisResult from the NLP profile
    analysisResult = buildResultFromNLP(nlpProfile, sampleTexts);
  }

  // Compute confidence score
  const confidenceScore = computeConfidenceScore(
    samples.length,
    analysisResult.consistencyScore
  );

  // Upsert Voice Profile
  const nextVersion = (currentProfile?.version || 0) + 1;

  const [voiceProfile] = await sql`
    INSERT INTO voice_profiles (
      id, "userId", tone, "sentenceStyle", "paragraphStyle", "hookPatterns", 
      "ctaStyle", "emojiUsage", "commonTopics", "wordsToAvoid", "writingPatterns", 
      "confidenceScore", "sampleCount", version, "sourceWeighting", metadata, "lastUpdated", "nlpProfile"
    ) VALUES (
      gen_random_uuid(), ${userId}, ${JSON.stringify(analysisResult.tone)}::jsonb, 
      ${analysisResult.sentenceStyle}, ${analysisResult.paragraphStyle}, 
      ${JSON.stringify(analysisResult.hookPatterns)}::jsonb, ${analysisResult.ctaStyle}, 
      ${analysisResult.emojiUsage}, ${JSON.stringify(analysisResult.commonTopics)}::jsonb, 
      ${analysisResult.wordsToAvoid}, ${JSON.stringify(analysisResult.writingPatterns)}::jsonb, 
      ${confidenceScore}, ${samples.length}, ${nextVersion}, 
      ${JSON.stringify(DEFAULT_SOURCE_WEIGHTS)}::jsonb, 
      ${JSON.stringify(analysisResult)}::jsonb, CURRENT_TIMESTAMP, ${JSON.stringify(nlpProfile)}::jsonb
    )
    ON CONFLICT ("userId") DO UPDATE SET
      tone = EXCLUDED.tone,
      "sentenceStyle" = EXCLUDED."sentenceStyle",
      "paragraphStyle" = EXCLUDED."paragraphStyle",
      "hookPatterns" = EXCLUDED."hookPatterns",
      "ctaStyle" = EXCLUDED."ctaStyle",
      "emojiUsage" = EXCLUDED."emojiUsage",
      "commonTopics" = EXCLUDED."commonTopics",
      "wordsToAvoid" = EXCLUDED."wordsToAvoid",
      "writingPatterns" = EXCLUDED."writingPatterns",
      "confidenceScore" = EXCLUDED."confidenceScore",
      "sampleCount" = EXCLUDED."sampleCount",
      version = ${nextVersion},
      "sourceWeighting" = EXCLUDED."sourceWeighting",
      metadata = EXCLUDED.metadata,
      "lastUpdated" = CURRENT_TIMESTAMP,
      "nlpProfile" = EXCLUDED."nlpProfile"
    RETURNING *
  `;

  // Store generation record
  await sql`
    INSERT INTO generations (
      id, "userId", type, input, output, model, "voiceDnaVersionUsed", "createdAt"
    ) VALUES (
      gen_random_uuid(), ${userId}, 'voice_analysis', 
      ${JSON.stringify({ sampleCount: samples.length, triggerReason })}::jsonb, 
      ${JSON.stringify(analysisResult)}::jsonb, 
      ${process.env.AI_MODEL || "gpt-4o"}, ${nextVersion}, CURRENT_TIMESTAMP
    )
  `;

  return {
    voiceProfile,
    nlpProfile,
    usedNlpOnly,
    confidenceTier:
      confidenceScore < 0.4
        ? "Emerging"
        : confidenceScore < 0.7
        ? "Solid"
        : "Strong",
    sampleCount: samples.length,
    triggerReason,
  };
}

/**
 * Build a VoiceAnalysisResult from NLP profile alone (no AI needed).
 * Used when AI provider is rate-limited or unavailable.
 */
function buildResultFromNLP(nlpProfile: any, _samples: string[]): any {
  const nlp = nlpProfile;

  // Derive tone from NLP tone scores
  const toneArr: string[] = [];
  if (nlp.tone.confidenceScore > 0.6) toneArr.push("confident");
  if (nlp.tone.warmthScore > 0.5) toneArr.push("encouraging");
  if (nlp.tone.formalityScore > 0.6) toneArr.push("formal");
  if (nlp.tone.directnessScore > 0.6) toneArr.push("direct");
  if (nlp.tone.humorScore > 0.3) toneArr.push("playful");
  if (toneArr.length === 0) toneArr.push("professional");

  // Sentence style from NLP
  const avgLen = nlp.sentenceStructure.avgSentenceLength;
  const sentenceStyle = avgLen < 8 ? "short" : avgLen < 15 ? "short-medium" : avgLen < 22 ? "medium" : "long";

  // Paragraph style from NLP
  const paraStyle = nlp.paragraphStructure.singleSentenceParagraphs > 50 ? "short" :
    nlp.paragraphStructure.singleSentenceParagraphs > 20 ? "medium" : "long";

  // Hook patterns from NLP
  const hookPatterns = nlp.hookPatterns.primaryHookTypes || [];

  // CTA style from NLP storytelling
  const ctaStyle = nlp.storytelling.ctaStyle || "none";

  // Emoji usage from NLP formatting
  const emojiUsage = nlp.formatting.emojiFrequency > 0.3 ? "high" :
    nlp.formatting.emojiFrequency > 0.1 ? "moderate" : "low";

  // Common topics from repeated words and vocabulary
  const commonTopics = (nlp.vocabulary.repetitionPatterns || []).slice(0, 5);

  // Words to avoid from filler words
  const wordsToAvoid = nlp.vocabulary.fillerWords || [];

  // Writing patterns from NLP analysis
  const writingPatterns = {
    usesLists: nlp.paragraphStructure.bulletListUsage > 0.3 || nlp.paragraphStructure.numberedListUsage > 0.3,
    asksQuestions: nlp.sentenceStructure.questionRatio > 10,
    usesAnalogies: nlp.vocabulary.technicalLevel === "advanced",
    usesLineBreaks: nlp.paragraphStructure.lineBreakFrequency > 3,
    personalStories: nlp.hookPatterns.hookCharacteristics?.includes("personal_first") || false,
    avgSentenceLength: sentenceStyle,
    emotionalRange: nlp.tone.emotionalRange,
    voiceArchetype: nlp.tone.voiceArchetype,
  };

  // Compute consistency from NLP
  const consistencyScore = nlp.consistency?.voiceConsistencyScore || 0.5;

  return {
    tone: toneArr,
    sentenceStyle,
    paragraphStyle: paraStyle,
    hookPatterns,
    ctaStyle,
    emojiUsage,
    commonTopics,
    wordsToAvoid,
    writingPatterns,
    consistencyScore,
  };
}
