/**
 * Voice Reanalysis Worker
 *
 * Background job that reanalyzes Voice DNA when samples change.
 */

import { Worker, Job } from "bullmq";
import { redisConnection } from "../connection";
import { sql } from "@/lib/db";
import { getProvider } from "@/lib/ai/types";
import { computeConfidenceScore } from "@/lib/voice/confidence";
import { DEFAULT_SOURCE_WEIGHTS } from "@/lib/voice/weighting";

interface ReanalysisJobData {
  userId: string;
  triggerReason: string;
}

export const voiceReanalysisWorker = new Worker(
  "voice-reanalysis",
  async (job: Job<ReanalysisJobData>) => {
    const { userId, triggerReason } = job.data;
    console.log(`[VoiceReanalysis] Processing user ${userId} (${triggerReason})`);

    try {
      const samples = await sql`SELECT * FROM writing_samples WHERE "userId" = ${userId} ORDER BY "createdAt" ASC`;

      if (samples.length < 3) {
        console.log(`[VoiceReanalysis] Only ${samples.length} samples — skipping`);
        return;
      }

      const [currentProfile] = await sql`SELECT * FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1`;

      // Snapshot before update
        const [maxVersion] = await sql`
          SELECT version FROM voice_profile_versions WHERE "userId" = ${userId} ORDER BY version DESC LIMIT 1
        `;

        await sql`
          INSERT INTO voice_profile_versions (
            id, "userId", version, snapshot, "triggerReason", "createdAt"
          ) VALUES (
            gen_random_uuid(), ${userId}, ${currentProfile.version}, 
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

      // Sort by weight
      const weightedSamples = samples
        .map((s: any) => ({
          content: s.content,
          weight: DEFAULT_SOURCE_WEIGHTS[s.source || "other"] || 0.4,
        }))
        .sort((a: any, b: any) => b.weight - a.weight);

      // Run AI analysis
      const provider = getProvider();
      const result = await provider.analyzeVoice(
        weightedSamples.map((s: any) => s.content),
        { sourceWeighting: DEFAULT_SOURCE_WEIGHTS }
      );

      const confidenceScore = computeConfidenceScore(
        samples.length,
        result.consistencyScore
      );

      const nextVersion = (currentProfile?.version || 0) + 1;

      // Upsert
      await sql`
        INSERT INTO voice_profiles (
          id, "userId", tone, "sentenceStyle", "paragraphStyle", "hookPatterns", 
          "ctaStyle", "emojiUsage", "commonTopics", "wordsToAvoid", "writingPatterns", 
          "confidenceScore", "sampleCount", version, metadata, "lastUpdated"
        ) VALUES (
          gen_random_uuid(), ${userId}, ${JSON.stringify(result.tone)}::jsonb, 
          ${result.sentenceStyle}, ${result.paragraphStyle}, 
          ${JSON.stringify(result.hookPatterns)}::jsonb, ${result.ctaStyle}, 
          ${result.emojiUsage}, ${JSON.stringify(result.commonTopics)}::jsonb, 
          ${result.wordsToAvoid}, ${JSON.stringify(result.writingPatterns)}::jsonb, 
          ${confidenceScore}, ${samples.length}, 1, 
          ${JSON.stringify(result)}::jsonb, CURRENT_TIMESTAMP
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
          metadata = EXCLUDED.metadata,
          "lastUpdated" = CURRENT_TIMESTAMP
      `;

      console.log(`[VoiceReanalysis] Updated user ${userId} to v${nextVersion} (confidence: ${confidenceScore})`);
    } catch (error) {
      console.error(`[VoiceReanalysis] Error for user ${userId}:`, error);
      throw error; // Let BullMQ retry
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,
  }
);

voiceReanalysisWorker.on("failed", (job, err) => {
  console.error(`[VoiceReanalysis] Job ${job?.id} failed:`, err.message);
});
