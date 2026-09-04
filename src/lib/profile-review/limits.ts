/**
 * Free Usage Limits for the Profile Review tool
 *
 * Configurable via PROFILE_REVIEW_CONFIG.limits (see config.ts).
 * - Anonymous: N analyses per day per IP
 * - Authenticated: N analyses per month per user
 *
 * In-memory sliding window (same approach as src/lib/rate-limit/limiter.ts).
 * Swap for a Redis-backed store in production if multi-instance scaling
 * requires it.
 */

import { PROFILE_REVIEW_CONFIG } from "./config";

interface LimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, LimitEntry>();

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
  kind: "anonymous" | "authenticated";
}

function consume(key: string, maxRequests: number, windowMs: number, kind: LimitResult["kind"]): LimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs, limit: maxRequests, kind };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, limit: maxRequests, kind };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt, limit: maxRequests, kind };
}

/** Client IP from request headers (x-forwarded-for set by most hosts). */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "anonymous";
}

export function checkProfileReviewLimit(
  request: Request,
  userId: string | null
): LimitResult {
  if (userId) {
    return consume(
      `pr:user:${userId}`,
      PROFILE_REVIEW_CONFIG.limits.authenticatedPerMonth,
      PROFILE_REVIEW_CONFIG.limits.windowMs.monthly,
      "authenticated"
    );
  }
  const ip = getClientIp(request);
  return consume(
    `pr:anon:${ip}`,
    PROFILE_REVIEW_CONFIG.limits.anonymousPerDay,
    PROFILE_REVIEW_CONFIG.limits.windowMs.daily,
    "anonymous"
  );
}

/** Reset the store (used by tests). */
export function resetProfileReviewLimits(): void {
  store.clear();
}