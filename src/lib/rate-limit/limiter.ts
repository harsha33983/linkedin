/**
 * Rate Limiter
 *
 * Server-side rate limiting using in-memory sliding window.
 * For production, consider Redis-backed rate limiting.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

// Default rate limits per plan
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  free: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20, // 20 AI generations per hour
  },
  creator: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100, // 100 AI generations per hour
  },
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 API requests per minute
  },
};

/**
 * Check if a request is within rate limits.
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    store.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get rate limit headers for API response.
 */
export function getRateLimitHeaders(
  result: ReturnType<typeof checkRateLimit>
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(
      RATE_LIMITS.api.maxRequests
    ),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
