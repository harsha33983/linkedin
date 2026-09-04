/**
 * Voice DNA Versioning
 *
 * Every reanalysis creates a snapshot of the previous version.
 * Users can revert to a prior version if reanalysis "drifts."
 */

import { sql } from "@/lib/db";

export type TriggerReason =
  | "sample_added"
  | "sample_deleted"
  | "manual_reanalyze"
  | "user_edit"
  | "slider_update";

/**
 * Save current VoiceProfile as a versioned snapshot before updating.
 */
export async function snapshotCurrentVersion(
  userId: string,
  triggerReason: TriggerReason
): Promise<void> {
  const [current] = await sql`SELECT * FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1`;

  if (!current) return; // No existing profile to snapshot

  // Get next version number
  const [maxVersion] = await sql`
    SELECT version FROM voice_profile_versions WHERE "userId" = ${userId} ORDER BY version DESC LIMIT 1
  `;

  const nextVersion = (maxVersion?.version || 0) + 1;

  const snapshot = {
    tone: current.tone,
    sentenceStyle: current.sentenceStyle,
    paragraphStyle: current.paragraphStyle,
    hookPatterns: current.hookPatterns,
    ctaStyle: current.ctaStyle,
    emojiUsage: current.emojiUsage,
    commonTopics: current.commonTopics,
    wordsToAvoid: current.wordsToAvoid,
    writingPatterns: current.writingPatterns,
    confidenceScore: current.confidenceScore,
    sampleCount: current.sampleCount,
    userConfirmed: current.userConfirmed,
    sourceWeighting: current.sourceWeighting,
    metadata: current.metadata,
  };

  await sql`
    INSERT INTO voice_profile_versions (
      id, "userId", version, snapshot, "triggerReason", "createdAt"
    ) VALUES (
      gen_random_uuid(), ${userId}, ${current.version}, ${JSON.stringify(snapshot)}::jsonb, 
      ${triggerReason}, CURRENT_TIMESTAMP
    )
  `;
}

/**
 * Get all versions for a user (for revert UI).
 */
export async function getVersionHistory(userId: string) {
  return sql`
    SELECT id, version, snapshot, "triggerReason", "createdAt" 
    FROM voice_profile_versions 
    WHERE "userId" = ${userId} 
    ORDER BY version DESC
  `;
}

/**
 * Revert VoiceProfile to a specific version.
 */
export async function revertToVersion(
  userId: string,
  targetVersion: number
): Promise<void> {
  const [versionSnapshot] = await sql`
    SELECT snapshot FROM voice_profile_versions 
    WHERE "userId" = ${userId} AND version = ${targetVersion} LIMIT 1
  `;

  if (!versionSnapshot) {
    throw new Error(`Version ${targetVersion} not found`);
  }

  const snapshot = versionSnapshot.snapshot as Record<string, unknown>;

  // Snapshot current before reverting
  await snapshotCurrentVersion(userId, "user_edit");

  // Update VoiceProfile to reverted state
  await sql`
    UPDATE voice_profiles SET
      tone = ${snapshot.tone ? JSON.stringify(snapshot.tone) + '::jsonb' : null},
      "sentenceStyle" = ${snapshot.sentenceStyle || null},
      "paragraphStyle" = ${snapshot.paragraphStyle || null},
      "hookPatterns" = ${snapshot.hookPatterns ? JSON.stringify(snapshot.hookPatterns) + '::jsonb' : null},
      "ctaStyle" = ${snapshot.ctaStyle || null},
      "emojiUsage" = ${snapshot.emojiUsage || null},
      "commonTopics" = ${snapshot.commonTopics ? JSON.stringify(snapshot.commonTopics) + '::jsonb' : null},
      "wordsToAvoid" = ${snapshot.wordsToAvoid ? JSON.stringify(snapshot.wordsToAvoid) + '::jsonb' : null},
      "writingPatterns" = ${snapshot.writingPatterns ? JSON.stringify(snapshot.writingPatterns) + '::jsonb' : null},
      "confidenceScore" = ${snapshot.confidenceScore || null},
      "sampleCount" = ${snapshot.sampleCount || null},
      "userConfirmed" = ${snapshot.userConfirmed || null},
      "sourceWeighting" = ${snapshot.sourceWeighting ? JSON.stringify(snapshot.sourceWeighting) + '::jsonb' : null},
      metadata = ${snapshot.metadata ? JSON.stringify(snapshot.metadata) + '::jsonb' : null},
      "lastUpdated" = CURRENT_TIMESTAMP
    WHERE "userId" = ${userId}
  `;
}
