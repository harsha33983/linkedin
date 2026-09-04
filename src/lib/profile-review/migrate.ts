/**
 * Profile Review Schema Migration
 * Creates linkedin_profile_analyses + profile_signals tables.
 *
 * NOTE: uses tagged-template sql (not sql.unsafe) — this Neon pooler
 * silently drops unsafe() DDL, while tagged templates execute reliably.
 */

import { sql } from "@/lib/db";

export async function migrateProfileReview(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS linkedin_profile_analyses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "userId" TEXT,
      "profileUrl" TEXT,
      "profileData" JSONB NOT NULL,
      "overallScore" INTEGER NOT NULL,
      "analysisResult" JSONB NOT NULL,
      "usedAi" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Extended columns for the retrieval-aware pipeline
  await sql`ALTER TABLE linkedin_profile_analyses ADD COLUMN IF NOT EXISTS "normalizedProfileUrl" TEXT`;
  await sql`ALTER TABLE linkedin_profile_analyses ADD COLUMN IF NOT EXISTS "categoryScores" JSONB`;
  await sql`ALTER TABLE linkedin_profile_analyses ADD COLUMN IF NOT EXISTS "aiReport" JSONB`;
  await sql`ALTER TABLE linkedin_profile_analyses ADD COLUMN IF NOT EXISTS "provider" TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS profile_recommendations (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "analysisId" TEXT NOT NULL REFERENCES linkedin_profile_analyses(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      problem TEXT NOT NULL,
      "whyItMatters" TEXT,
      recommendation TEXT NOT NULL,
      example TEXT,
      status TEXT DEFAULT 'open',
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS profile_keywords (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "analysisId" TEXT NOT NULL REFERENCES linkedin_profile_analyses(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL,
      category TEXT NOT NULL,
      "relevanceScore" DOUBLE PRECISION DEFAULT 0,
      source TEXT,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS profile_signals (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "userId" TEXT NOT NULL UNIQUE,
      "professionalIdentity" TEXT,
      "expertise" JSONB DEFAULT '[]',
      "topics" JSONB DEFAULT '[]',
      "keywords" JSONB DEFAULT '[]',
      "positioning" TEXT,
      "audience" TEXT,
      "sourceAnalysisId" TEXT,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  console.log("[ProfileReview Migration] Tables created successfully");
}

// Run directly: npx tsx --env-file=.env.local src/lib/profile-review/migrate.ts
if (require.main === module) {
  migrateProfileReview()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[ProfileReview Migration] Failed:", err);
      process.exit(1);
    });
}