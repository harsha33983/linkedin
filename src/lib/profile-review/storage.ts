/**
 * Profile Review Storage
 *
 * Persists analyses (linkedin_profile_analyses), recommendations
 * (profile_recommendations), and keywords (profile_keywords) for
 * authenticated users. Returns the new analysis id.
 */

import { sql } from "@/lib/db";
import type { ProfileReviewResult } from "./service";

export async function storeAnalysis(
  userId: string,
  result: ProfileReviewResult
): Promise<string> {
  const [row] = await sql`
    INSERT INTO linkedin_profile_analyses (
      id, "userId", "profileUrl", "normalizedProfileUrl", "profileData",
      "overallScore", "categoryScores", "analysisResult", "aiReport",
      "provider", "usedAi", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(), ${userId}, ${result.profileUrl},
      ${result.profileUrl},
      ${JSON.stringify(result.profileData)}::jsonb,
      ${result.overallScore},
      ${JSON.stringify(
        Object.fromEntries(result.categories.map((c) => [c.key, c.score]))
      )}::jsonb,
      ${JSON.stringify(result)}::jsonb,
      ${JSON.stringify(result.suggestions)}::jsonb,
      ${result.dataSource.source || null},
      ${result.usedAi},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) RETURNING id
  `;

  const analysisId: string = row.id;

  // Recommendations
  for (const rec of result.recommendations) {
    await sql`
      INSERT INTO profile_recommendations (
        id, "analysisId", category, priority, problem, "whyItMatters",
        recommendation, example, status, "createdAt"
      ) VALUES (
        gen_random_uuid(), ${analysisId}, ${rec.category}, ${rec.priority},
        ${rec.problem}, ${rec.why}, ${rec.recommendation}, ${rec.example || null},
        'open', CURRENT_TIMESTAMP
      )
    `;
  }

  // Keywords (from NLP + intelligence keyword clusters)
  const keywordEntries: { keyword: string; category: string; score: number }[] = [];
  for (const kw of result.sections.keywords.keywords.slice(0, 15)) {
    keywordEntries.push({ keyword: kw, category: "current", score: 80 });
  }
  for (const kw of result.sections.keywords.missingKeywords.slice(0, 10)) {
    keywordEntries.push({ keyword: kw, category: "missing", score: 40 });
  }
  for (const cluster of result.intelligence.keywordClusters) {
    for (const kw of cluster.keywords.slice(0, 5)) {
      keywordEntries.push({ keyword: kw, category: `cluster:${cluster.cluster}`, score: 60 });
    }
  }
  for (const entry of keywordEntries.slice(0, 40)) {
    await sql`
      INSERT INTO profile_keywords (
        id, "analysisId", keyword, category, "relevanceScore", source, "createdAt"
      ) VALUES (
        gen_random_uuid(), ${analysisId}, ${entry.keyword}, ${entry.category},
        ${entry.score}, ${result.dataSource.source || "manual"}, CURRENT_TIMESTAMP
      )
    `;
  }

  return analysisId;
}