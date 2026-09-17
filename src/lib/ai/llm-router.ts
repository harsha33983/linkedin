/**
 * LLM Router — task classification + resilient generation.
 *
 * Central entry point (`routeGenerate`) that:
 *  1. Classifies the task (complexity + type) — trivial tasks never reach an LLM.
 *  2. Routes HIGH-complexity tasks to the primary LLM provider, MEDIUM to the
 *     secondary (cheap) provider, LOW to the deterministic local path.
 *  3. Adds resilience on top of the existing provider failover:
 *       - bounded retries with exponential backoff on 429/timeout (max 2 retries)
 *       - per-provider circuit breaker (stop hammering a provider that is down)
 *       - provider health metrics (request/success/429 counts, latency, tokens, cost)
 *       - generation logging to `generation_logs`
 *  4. Caches idempotent sub-results (style analysis) keyed by user+inputs hash.
 *
 * Frontend never learns which provider answered. Groq is one provider inside
 * this abstraction — not the center of the app.
 */

import { randomUUID } from "crypto";

// ─────────────────────────────────────────────────────────────
// Task types & complexity
// ─────────────────────────────────────────────────────────────

export type TaskType =
  | "POST_GENERATION"
  | "STORYTELLING"
  | "REWRITE"
  | "HUMANIZE"
  | "HOOK_GENERATION"
  | "IDEA_GENERATION"
  | "STYLE_ANALYSIS"
  | "HASHTAGS"
  | "SUMMARIZATION"
  | "FORMAT";

export type Complexity = "LOW" | "MEDIUM" | "HIGH";

/** Deterministic task classification. No LLM is consulted for this. */
export function classifyTask(type: TaskType, inputSize: number = 0): Complexity {
  switch (type) {
    case "HASHTAGS":
    case "FORMAT":
    case "SUMMARIZATION":
      // Handled by deterministic code paths — never an LLM.
      return "LOW";
    case "HOOK_GENERATION":
    case "IDEA_GENERATION":
    case "REWRITE":
      return "MEDIUM";
    case "POST_GENERATION":
    case "STORYTELLING":
    case "STYLE_ANALYSIS":
      // Long inputs (voice samples, big context) justify the premium provider.
      return inputSize > 4_000 ? "HIGH" : "HIGH";
    default:
      return "MEDIUM";
  }
}

// ─────────────────────────────────────────────────────────────
// Circuit breaker + provider health
// ─────────────────────────────────────────────────────────────

interface ProviderHealth {
  requestCount: number;
  successCount: number;
  failureCount: number;
  rateLimit429Count: number;
  totalLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  // circuit breaker state
  opened: boolean;
  openedAt: number;
  consecutiveFailures: number;
}

const BREAKER_THRESHOLD = 4;      // consecutive failures before opening
const BREAKER_COOLDOWN_MS = 60_000; // half-open after 60s

const health = new Map<string, ProviderHealth>();

export function getHealth(name: string): ProviderHealth {
  let h = health.get(name);
  if (!h) {
    h = {
      requestCount: 0, successCount: 0, failureCount: 0, rateLimit429Count: 0,
      totalLatencyMs: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0,
      opened: false, openedAt: 0, consecutiveFailures: 0,
    };
    health.set(name, h);
  }
  return h;
}

/** True when the circuit allows a request (closed, or half-open after cooldown). */
export function circuitAllows(name: string): boolean {
  const h = getHealth(name);
  if (!h.opened) return true;
  if (Date.now() - h.openedAt >= BREAKER_COOLDOWN_MS) {
    // half-open: allow one probe
    return true;
  }
  return false;
}

export function recordSuccess(name: string, latencyMs: number, tokens?: { in: number; out: number }) {
  const h = getHealth(name);
  h.requestCount++;
  h.successCount++;
  h.consecutiveFailures = 0;
  h.opened = false;
  h.totalLatencyMs += latencyMs;
  if (tokens) {
    h.inputTokens += tokens.in;
    h.outputTokens += tokens.out;
    h.estimatedCostUsd += estimateCost(name, tokens.in, tokens.out);
  }
}

export function recordFailure(name: string, kind: "rate_limit" | "error", latencyMs: number) {
  const h = getHealth(name);
  h.requestCount++;
  h.failureCount++;
  h.totalLatencyMs += latencyMs;
  if (kind === "rate_limit") h.rateLimit429Count++;
  h.consecutiveFailures++;
  if (h.consecutiveFailures >= BREAKER_THRESHOLD) {
    h.opened = true;
    h.openedAt = Date.now();
  }
}

/** Snapshot for observability dashboards/logs. */
export function providerHealthSnapshot() {
  const out: Record<string, Omit<ProviderHealth, "openedAt" | "consecutiveFailures"> & { avgLatencyMs: number }> = {};
  for (const [name, h] of Array.from(health.entries())) {
    out[name] = {
      requestCount: h.requestCount,
      successCount: h.successCount,
      failureCount: h.failureCount,
      rateLimit429Count: h.rateLimit429Count,
      totalLatencyMs: h.totalLatencyMs,
      inputTokens: h.inputTokens,
      outputTokens: h.outputTokens,
      estimatedCostUsd: Math.round(h.estimatedCostUsd * 1e6) / 1e6,
      opened: h.opened,
      avgLatencyMs: h.successCount > 0 ? Math.round(h.totalLatencyMs / h.successCount) : 0,
    };
  }
  return out;
}

/** Rough list-price estimates per 1M tokens (conservative, provider-tagged). */
const COST_PER_1M: Record<string, { in: number; out: number }> = {
  groq: { in: 0.07, out: 0.07 },          // openai/gpt-oss-120b tier
  openrouter: { in: 0.15, out: 0.6 },     // blended free/paid estimate
  openai: { in: 0.15, out: 0.6 },
  kimi: { in: 0.15, out: 0.6 },
};

export function estimateCost(provider: string, inputTokens: number, outputTokens: number): number {
  const rate = COST_PER_1M[provider] || { in: 0.15, out: 0.6 };
  return (inputTokens * rate.in + outputTokens * rate.out) / 1_000_000;
}

// ─────────────────────────────────────────────────────────────
// Generation logging (generation_logs table)
// ─────────────────────────────────────────────────────────────

export interface LogParams {
  userId?: string;
  requestType: string;          // TaskType or route-specific label
  provider?: string;
  model?: string;
  promptName?: string;
  promptVersion?: string;
  taskComplexity?: Complexity;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  status: "success" | "error" | "fallback";
  errorCode?: string;
  retries?: number;
  estimatedCostUsd?: number;
}

/**
 * Fire-and-forget logging — NEVER blocks or fails a generation.
 * Lazy-imports the DB so tests / offline usage don't require Postgres.
 */
export function logGeneration(p: LogParams): void {
  Promise.resolve().then(async () => {
    try {
      const cost = p.estimatedCostUsd ?? (p.provider && p.inputTokens && p.outputTokens
        ? estimateCost(p.provider, p.inputTokens, p.outputTokens)
        : 0);
      const { sql } = await import("@/lib/db");
      await sql`
        INSERT INTO generation_logs (
          id, "userId", "requestType", provider, model, "promptName", "promptVersion",
          "taskComplexity", "inputTokens", "outputTokens", "latencyMs", status,
          "errorCode", retries, "estimatedCostUsd"
        ) VALUES (
          ${randomUUID()}, ${p.userId || null}, ${p.requestType}, ${p.provider || null},
          ${p.model || null}, ${p.promptName || null}, ${p.promptVersion || null},
          ${p.taskComplexity || null}, ${p.inputTokens ?? null}, ${p.outputTokens ?? null},
          ${p.latencyMs ?? null}, ${p.status}, ${p.errorCode || null}, ${p.retries ?? 0},
          ${Math.round(cost * 1e6) / 1e6}
        )
      `;
      // Usage rollup — same fire-and-forget guarantees.
      if (p.userId && (p.inputTokens || p.outputTokens)) {
        const { recordUsage } = await import("./usage");
        await recordUsage(p.userId, {
          inputTokens: p.inputTokens,
          outputTokens: p.outputTokens,
          estimatedCostUsd: cost,
        });
      }
    } catch (err: any) {
      // Observability must never break generation. Log a short, safe line.
      console.warn("[llm-router] generation_log insert failed:", String(err?.message || err).slice(0, 120));
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Bounded retry with exponential backoff
// ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function is429(err: any): boolean {
  return err?.status === 429 || err?.statusCode === 429 || /rate limit|429/i.test(String(err?.message || ""));
}
export function isTimeout(err: any): boolean {
  return err?.name === "AbortError" || /timeout|ETIMEDOUT|aborted/i.test(String(err?.message || ""));
}
export function isAuthError(err: any): boolean {
  return err?.status === 401 || err?.status === 403 || /unauthorized|forbidden|api key|401|403/i.test(String(err?.message || ""));
}

interface RetryOpts {
  maxRetries?: number;          // default 2 → 3 attempts total
  baseDelayMs?: number;         // default 1_000, doubles each attempt
  onRetry?: (attempt: number, delayMs: number, reason: string) => void;
}

/**
 * Runs `fn` with bounded exponential backoff on 429/timeout.
 * Auth errors and hard failures are NOT retried (they won't fix themselves).
 * Never retries infinitely — hard rule.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {}
): Promise<{ result: T; retries: number }> {
  const maxRetries = opts.maxRetries ?? 2;
  const base = opts.baseDelayMs ?? 1_000;
  let lastErr: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, retries: attempt };
    } catch (err: any) {
      lastErr = err;
      const retryable = is429(err) || isTimeout(err);
      // Auth errors and hard connection failures (ECONNREFUSED, DNS) fail fast:
      // retrying them just burns time. Only transient conditions retry.
      const hardError = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|certificate|invalid api key/i.test(String(err?.message || err));
      if (!retryable || hardError || attempt === maxRetries) throw err;
      const delay = base * Math.pow(2, attempt);
      opts.onRetry?.(attempt + 1, delay, is429(err) ? "429" : "timeout");
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────
// The router entry point
// ─────────────────────────────────────────────────────────────

export interface RouteRequest<T> {
  taskType: TaskType;
  /** Route label used in logs (e.g. "generate-post-stream"). */
  routeName?: string;
  promptName?: string;
  promptVersion?: string;
  userId?: string;
  /**
   * Executes the task on a named provider. The router decides the order of
   * providers; `op` must itself be provider-agnostic (use the AIProvider seam).
   */
  op: (provider: string) => Promise<T>;
  /** Returns true when a result is good enough to return to the user. */
  isUsable?: (result: T) => boolean;
  /** Local/deterministic fallback for when every provider is down. */
  fallback?: () => Promise<T>;
  /** Approximate input size for classification. */
  inputSize?: number;
}

export interface RouteResult<T> {
  result: T;
  provider: string;
  retries: number;
  fallbackUsed: boolean;
  taskType: TaskType;
  complexity: Complexity;
}

/**
 * Route a task:
 *   HIGH   → primary provider (with retry+backoff) → secondary → local fallback
 *   MEDIUM → primary (1 retry) → secondary → local fallback
 *   LOW    → local fallback directly (never an LLM)
 *
 * Circuits are respected: an open provider is skipped without a call attempt.
 */
export async function routeGenerate<T>(req: RouteRequest<T>): Promise<RouteResult<T>> {
  const { taskType } = req;
  const complexity = classifyTask(taskType, req.inputSize);
  const routeName = req.routeName || taskType.toLowerCase();

  // LOW complexity → deterministic path, zero LLM cost.
  if (complexity === "LOW") {
    if (req.fallback) {
      const started = Date.now();
      try {
        const result = await req.fallback();
        logGeneration({
          requestType: routeName, provider: "local", taskComplexity: "LOW",
          latencyMs: Date.now() - started, status: "success",
          promptName: req.promptName, promptVersion: req.promptVersion, userId: req.userId,
        });
        return { result, provider: "local", retries: 0, fallbackUsed: true, taskType, complexity };
      } catch (err: any) {
        logGeneration({
          requestType: routeName, provider: "local", taskComplexity: "LOW",
          latencyMs: Date.now() - started, status: "error",
          errorCode: "LOCAL_FALLBACK_FAILED", userId: req.userId,
        });
        throw err;
      }
    }
    throw new Error(`Task ${taskType} is LOW complexity but no deterministic fallback was provided`);
  }

  const { getProviderOrder } = await import("./provider-order");
  const order = getProviderOrder(complexity);

  let lastErr: any;
  let totalRetries = 0;

  for (const providerName of order) {
    // Circuit breaker — skip an open provider without spending a call.
    if (!circuitAllows(providerName)) {
      console.warn(`[llm-router] circuit open for "${providerName}" — skipping`);
      continue;
    }

    const started = Date.now();
    try {
      const { result, retries } = await withRetry(
        () => req.op(providerName),
        {
          maxRetries: complexity === "HIGH" ? 2 : 1,
          onRetry: (attempt, delay, reason) => {
            console.warn(`[llm-router] ${routeName} ${providerName} retry #${attempt} after ${delay}ms (${reason})`);
          },
        }
      );
      totalRetries += retries;

      if (req.isUsable && !req.isUsable(result)) {
        recordFailure(providerName, "error", Date.now() - started);
        logGeneration({
          requestType: routeName, provider: providerName, taskComplexity: complexity,
          latencyMs: Date.now() - started, status: "error", errorCode: "UNUSABLE_RESULT",
          retries: retries, promptName: req.promptName, promptVersion: req.promptVersion, userId: req.userId,
        });
        lastErr = new Error(`Unusable result from ${providerName}`);
        continue; // try next provider
      }

      recordSuccess(providerName, Date.now() - started);
      logGeneration({
        requestType: routeName, provider: providerName, taskComplexity: complexity,
        latencyMs: Date.now() - started, status: "success", retries,
        promptName: req.promptName, promptVersion: req.promptVersion, userId: req.userId,
      });
      return { result, provider: providerName, retries: totalRetries, fallbackUsed: false, taskType, complexity };
    } catch (err: any) {
      const kind = is429(err) ? "rate_limit" : "error";
      const latency = Date.now() - started;
      recordFailure(providerName, kind, latency);
      const code = is429(err) ? "LLM_RATE_LIMITED" : isTimeout(err) ? "TIMEOUT" : isAuthError(err) ? "PROVIDER_AUTH" : "PROVIDER_ERROR";
      logGeneration({
        requestType: routeName, provider: providerName, taskComplexity: complexity,
        latencyMs: latency, status: "error", errorCode: code, userId: req.userId,
      });
      lastErr = err;
      console.warn(`[llm-router] ${routeName} provider "${providerName}" failed (${code}):`, String(err?.message || err).slice(0, 140));
      // continue to next provider
    }
  }

  // Every provider failed → deterministic fallback, if any.
  if (req.fallback) {
    const started = Date.now();
    try {
      const result = await req.fallback();
      logGeneration({
        requestType: routeName, provider: "local", taskComplexity: complexity,
        latencyMs: Date.now() - started, status: "fallback", errorCode: "ALL_PROVIDERS_FAILED",
        userId: req.userId,
      });
      return { result, provider: "local", retries: totalRetries, fallbackUsed: true, taskType, complexity };
    } catch (fbErr: any) {
      logGeneration({
        requestType: routeName, provider: "local", taskComplexity: complexity,
        latencyMs: Date.now() - started, status: "error", errorCode: "LOCAL_FALLBACK_FAILED",
        userId: req.userId,
      });
      throw fbErr;
    }
  }

  throw lastErr || new Error(`All providers failed for ${taskType}`);
}
