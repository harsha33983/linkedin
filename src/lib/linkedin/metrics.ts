/**
 * Post Metrics — shared shape + reader
 *
 * Real LinkedIn engagement numbers are stored on a published post's
 * `publishingResponse.metrics` (populated by a LinkedIn analytics sync):
 *
 * {
 *   impressions, likes, comments, reposts, saves,
 *   source: "linkedin",
 *   fetchedAt: ISO,
 *   raw: { IMPRESSION, REACTION, COMMENT, RESHARE, POST_SAVE }
 * }
 *
 * Everything downstream (Performance/Audience DNA, idea generation, post
 * generation) MUST read through readPostMetrics() so the app can never
 * accidentally consume fabricated numbers. Missing metrics are zeros with
 * `real: false` — callers decide how to describe that honestly.
 */

export interface PostMetrics {
  impressions: number;
  likes: number; // LinkedIn REACTION count
  comments: number;
  reposts: number; // LinkedIn RESHARE count
  saves: number;
  engagementRate: number; // (likes+comments+reposts+saves) / impressions
  /** True only when a real source (LinkedIn analytics sync) supplied the counts. */
  real: boolean;
  fetchedAt: string | null;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
  const n = Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Read metrics from a post's publishingResponse JSONB.
 *
 * Supports:
 *  - new shape: { metrics: { impressions, likes, comments, reposts, saves, source, fetchedAt } }
 *  - legacy shape: flat { impressions, likes, comments, reposts, saves } (written by old code paths)
 */
export function readPostMetrics(publishingResponse: unknown): PostMetrics {
  if (!publishingResponse || typeof publishingResponse !== "object") {
    return emptyMetrics();
  }

  const pub = publishingResponse as Record<string, any>;
  const m = pub.metrics && typeof pub.metrics === "object" ? (pub.metrics as Record<string, any>) : null;

  const impressions = m ? num(m.impressions) : num(pub.impressions);
  const likes = m ? num(m.likes ?? m.reactions) : num(pub.likes);
  const comments = m ? num(m.comments) : num(pub.comments);
  const reposts = m ? num(m.reposts ?? m.shares) : num(pub.reposts);
  const saves = m ? num(m.saves) : num(pub.saves);

  const real =
    (m !== null && m.source === "linkedin") ||
    impressions > 0 ||
    likes > 0 ||
    comments > 0 ||
    reposts > 0 ||
    saves > 0;

  const engagementRate = impressions > 0 ? (likes + comments + reposts + saves) / impressions : 0;

  return {
    impressions,
    likes,
    comments,
    reposts,
    saves,
    engagementRate,
    real,
    fetchedAt: m?.fetchedAt || null,
  };
}

function emptyMetrics(): PostMetrics {
  return {
    impressions: 0,
    likes: 0,
    comments: 0,
    reposts: 0,
    saves: 0,
    engagementRate: 0,
    real: false,
    fetchedAt: null,
  };
}

/** The canonical metric keys we persist into `posts.publishingResponse.metrics`. */
export const METRIC_KEYS = [
  "impressions",
  "likes",
  "comments",
  "reposts",
  "saves",
] as const;
