import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { providerHealthSnapshot } from "@/lib/ai/llm-router";
import { usageSummary } from "@/lib/ai/usage";

/**
 * GET /api/admin/ai-health — LLM observability snapshot.
 *
 * In-process provider health (requests, 429s, latency, tokens, estimated cost)
 * plus the last 24h of generation_logs aggregates from the DB, and the
 * caller's own usage summary. Authenticated (per-user scope, matching
 * /api/admin/jobs). Never exposes API keys or provider internals.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);

    const inMemory = providerHealthSnapshot();

    let last24h: any = null;
    try {
      const [row] = await sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'success')::int AS success,
          COUNT(*) FILTER (WHERE status = 'error')::int AS errors,
          COUNT(*) FILTER (WHERE "errorCode" = 'LLM_RATE_LIMITED')::int AS rate_limited,
          COUNT(*) FILTER (WHERE status = 'fallback')::int AS fallbacks,
          COALESCE(ROUND(AVG("latencyMs")), 0)::int AS avg_latency_ms,
          COALESCE(SUM("estimatedCostUsd"), 0) AS est_cost_usd,
          COALESCE(SUM("inputTokens"), 0)::int AS input_tokens,
          COALESCE(SUM("outputTokens"), 0)::int AS output_tokens
        FROM generation_logs
        WHERE "createdAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - INTERVAL '24 hours')
      `;
      last24h = row;
    } catch {
      last24h = null; // table may not exist yet in fresh envs
    }

    let byProvider: any[] = [];
    try {
      const rows = await sql`
        SELECT provider, model, COUNT(*)::int AS calls,
               COUNT(*) FILTER (WHERE status = 'success')::int AS success,
               COALESCE(ROUND(AVG("latencyMs")), 0)::int AS avg_latency_ms,
               COALESCE(SUM("estimatedCostUsd"), 0) AS est_cost_usd
        FROM generation_logs
        WHERE "createdAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - INTERVAL '24 hours')
        GROUP BY provider, model
        ORDER BY calls DESC
      `;
      byProvider = rows as any[];
    } catch {
      byProvider = [];
    }

    const usage = await usageSummary(userId, 7);

    return Response.json({
      success: true,
      data: {
        inMemory,
        last24h,
        byProvider,
        usage,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
