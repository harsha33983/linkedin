/**
 * DNA Schema Migration
 * Creates the 4 DNA tables + snapshots table.
 */

import { sql } from "@/lib/db";

export async function migrateDNA(): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS performance_dna (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "userId" TEXT NOT NULL UNIQUE,
      "topicScores" JSONB DEFAULT '{}',
      "hookScores" JSONB DEFAULT '{}',
      "formatScores" JSONB DEFAULT '{}',
      "structureScores" JSONB DEFAULT '{}',
      "lengthScores" JSONB DEFAULT '{}',
      "timingScores" JSONB DEFAULT '{}',
      "avgEngagementRate" DOUBLE PRECISION DEFAULT 0,
      "topPerformingPosts" JSONB DEFAULT '[]',
      "underperformingPatterns" JSONB DEFAULT '[]',
      "confidenceScore" DOUBLE PRECISION DEFAULT 0,
      "sampleSize" INTEGER DEFAULT 0,
      "lastAnalyzed" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS audience_dna (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "userId" TEXT NOT NULL UNIQUE,
      "audienceProfile" JSONB DEFAULT '{}',
      "responsePatterns" JSONB DEFAULT '{}',
      "engagementByTime" JSONB DEFAULT '{}',
      "engagementByDay" JSONB DEFAULT '{}',
      "commentThemes" JSONB DEFAULT '[]',
      "shareTriggers" JSONB DEFAULT '[]',
      "avgImpressions" DOUBLE PRECISION DEFAULT 0,
      "avgComments" DOUBLE PRECISION DEFAULT 0,
      "avgShares" DOUBLE PRECISION DEFAULT 0,
      "confidenceScore" DOUBLE PRECISION DEFAULT 0,
      "sampleSize" INTEGER DEFAULT 0,
      "lastAnalyzed" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS trend_dna (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "userId" TEXT NOT NULL UNIQUE,
      "activeTrends" JSONB DEFAULT '[]',
      "trendScores" JSONB DEFAULT '{}',
      "evergreenTopics" JSONB DEFAULT '[]',
      "seasonalPatterns" JSONB DEFAULT '{}',
      "industryNews" JSONB DEFAULT '[]',
      "freshnessScore" DOUBLE PRECISION DEFAULT 0,
      "lastRefreshed" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS dna_snapshots (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "userId" TEXT NOT NULL,
      "snapshotType" TEXT NOT NULL,
      "data" JSONB NOT NULL,
      "trigger" TEXT DEFAULT 'scheduled',
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("[DNA Migration] All tables created successfully");
}
