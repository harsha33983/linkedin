/**
 * viralPostUsageService — plan-aware limits for the Viral Posts feature.
 *
 * Reuses the EXISTING plan model (RATE_LIMITS.free / .creator in
 * src/lib/rate-limit/limiter.ts) instead of hard-coding limits in the UI:
 * FREE plan users get cached browsing + a small daily AI-generation quota;
 * creator-plan users get a larger quota. Redis-backed limiter enforces it.
 */

import { checkRateLimitRedis } from "@/lib/rate-limit/redis-limiter";
import { RATE_LIMITS } from "@/lib/rate-limit/limiter";

export type Plan = keyof typeof RATE_LIMITS; // "free" | "creator" | "api"

export interface ViralUsageState {
  plan: Plan;
  aiGenerationsLimit: number;
  aiGenerationsRemaining: number;
  resetAt: number;
  advancedFilters: boolean; // paid: reaction/date/keyword advanced filters
  personalizedRecommendations: boolean;
  savedIdeaQuota: number;
}

const FREE_AI_PER_DAY = 3;
const CREATOR_AI_PER_DAY = Number(RATE_LIMITS.creator.maxRequests); // reuse plan config

export async function getViralUsage(userId: string, plan: Plan = "free"): Promise<ViralUsageState> {
  const limit = plan === "free" ? FREE_AI_PER_DAY : CREATOR_AI_PER_DAY;
  // Daily window keyed per user+plan
  const dayBucket = Math.floor(Date.now() / 86_400_000);
  const rl = await checkRateLimitRedis(`viral:ai:${plan}:${userId}:${dayBucket}`, limit, 86_400_000);
  return {
    plan,
    aiGenerationsLimit: limit,
    aiGenerationsRemaining: rl.remaining,
    resetAt: rl.resetAt,
    advancedFilters: plan !== "free",
    personalizedRecommendations: plan !== "free",
    savedIdeaQuota: plan === "free" ? 10 : 100,
  };
}

/** Consume one AI-generation credit. Returns false when the quota is used up. */
export async function consumeAiGeneration(userId: string, plan: Plan = "free"): Promise<boolean> {
  const state = await getViralUsage(userId, plan);
  return state.aiGenerationsRemaining > 0;
}

/** Resolve the user's plan from the existing DB (users have no plans table yet — default free). */
export async function resolvePlan(userId: string): Promise<Plan> {
  try {
    const { sql } = await import("@/lib/db");
    const [row] = await sql`SELECT "plan" FROM "user_profiles" WHERE "userId" = ${userId} LIMIT 1`;
    const p = (row as any)?.plan;
    return p === "creator" || p === "api" ? p : "free";
  } catch {
    return "free";
  }
}
