/**
 * Usage tracking — per-user daily LLM usage in `generation_usage`.
 *
 * Limits themselves come from the existing subscription configuration; this
 * module only records and reports consumption. Upsert-friendly so multiple
 * generations on the same day accumulate.
 */

import { sql } from "@/lib/db";
import { randomUUID } from "crypto";

export interface UsageDelta {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

/** Record one generation against today's usage row. Never throws. */
export async function recordUsage(userId: string, delta: UsageDelta): Promise<void> {
  try {
    await sql`
      INSERT INTO generation_usage (id, "userId", requests, "inputTokens", "outputTokens", "estimatedCostUsd")
      VALUES (${randomUUID()}, ${userId}, 1, ${delta.inputTokens || 0}, ${delta.outputTokens || 0}, ${delta.estimatedCostUsd || 0})
      ON CONFLICT ("userId", "date")
      DO UPDATE SET
        requests = generation_usage.requests + 1,
        "inputTokens" = generation_usage."inputTokens" + ${delta.inputTokens || 0},
        "outputTokens" = generation_usage."outputTokens" + ${delta.outputTokens || 0},
        "estimatedCostUsd" = generation_usage."estimatedCostUsd" + ${delta.estimatedCostUsd || 0}
    `;
  } catch (err: any) {
    console.warn("[usage] record failed:", String(err?.message || err).slice(0, 120));
  }
}

/** Usage for the last N days (default 7). Returns empty list on failure. */
export async function usageSummary(userId: string, days: number = 7) {
  try {
    const rows = await sql`
      SELECT date, requests, "inputTokens", "outputTokens", "estimatedCostUsd"
      FROM generation_usage
      WHERE "userId" = ${userId}
        AND date > (CURRENT_DATE - ${days}::int)
      ORDER BY date DESC
    `;
    return rows as any[];
  } catch (err: any) {
    console.warn("[usage] read failed:", String(err?.message || err).slice(0, 120));
    return [];
  }
}
