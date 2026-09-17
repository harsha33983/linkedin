/**
 * Redis-backed Rate Limiter
 *
 * Uses a Redis fixed-window counter so limits are shared across serverless
 * instances. Falls back to an in-memory store when Redis is unreachable (single
 * instance) — so a Redis outage never takes down the app, it just weakens the
 * limit to per-process.
 *
 * Keys are scoped by a caller-supplied `key` plus a window id, e.g.
 *   rl:post-gen:user_<id>:<hourBucket>
 *
 * We intentionally keep the window small enough that the key's high-entropy
 * portion (the user id / ip) is what varies, not the whole key.
 */

import { Redis } from "ioredis";

const WINDOW_MS = 60_000; // 1 minute fixed window

// Lazily-created Redis client (shared across calls). If REDIS_URL is missing or
// unreachable we fall back to an in-memory Map. The client is created lazily so
// a cold build without Redis still boots.
let redis: Redis | null = null;
let redisAttempted = false;
let redisFailed = false;

function getRedis(): Redis | null {
  if (redis) return redis;
  if (redisAttempted) return redisFailed ? null : redis;
  redisAttempted = true;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisFailed = true;
    return null;
  }
  try {
    redis = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      enableOfflineQueue: false,
    });
    redis.on("error", () => {
      // Swallow transient Redis errors; the fallback in-memory store handles them.
      redisFailed = true;
    });
    redis.on("ready", () => {
      redisFailed = false;
    });
    return redis;
  } catch {
    redisFailed = true;
    return null;
  }
}

// In-memory fallback (single instance)
const memory = new Map<string, { count: number; resetAt: number }>();

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

function memoryCheck(key: string, max: number, windowMs: number): LimitResult {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now > entry.resetAt) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs, limit: max };
  }
  if (entry.count >= max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, limit: max };
  }
  entry.count++;
  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt, limit: max };
}

export async function checkRateLimitRedis(
  key: string,
  maxRequests: number,
  windowMs: number = WINDOW_MS
): Promise<LimitResult> {
  const r = getRedis();
  const bucket = Math.floor(Date.now() / windowMs);
  const rlKey = `rl:${key}:${bucket}`;

  if (r) {
    try {
      const count = await r.incr(rlKey);
      if (count === 1) await r.expire(rlKey, Math.ceil(windowMs / 1000));
      const settle = Math.min(count, maxRequests);
      return {
        allowed: count <= maxRequests,
        remaining: Math.max(0, maxRequests - settle),
        resetAt: Date.now() + windowMs,
        limit: maxRequests,
      };
    } catch {
      // Redis error — fall through to memory
    }
  }

  return memoryCheck(key, maxRequests, windowMs);
}

/** A tiny synchronous wrapper for callers that want to keep using the old API. */
export async function checkRateLimitRedisSync(
  key: string,
  config: { windowMs: number; maxRequests: number }
): Promise<LimitResult> {
  return checkRateLimitRedis(key, config.maxRequests, config.windowMs);
}
