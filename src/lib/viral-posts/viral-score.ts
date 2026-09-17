/**
 * Viral score — the SAME deterministic formula as the Python service
 * (scraper-service/app/services/viral_score.py). Both implementations must
 * stay in sync: cached DB rows and live scrape results then agree.
 *
 * Signals (not reactions-only): total engagement (log-scaled), comment depth,
 * share ratio, comment-to-reaction quality, recency (7-day half-life) and
 * 90-day freshness. Zero engagement always scores 0.
 */

export interface ViralScoreInput {
  reactions?: number | null;
  comments?: number | null;
  reposts?: number | null;
  publishedAt?: string | null;
}

function logScale(value: number, cap: number): number {
  if (value <= 0) return 0;
  return Math.min(1, Math.log10(1 + value) / Math.log10(1 + cap));
}

export function calculateViralScore(post: ViralScoreInput): number {
  const reactions = Math.max(0, Math.round(post.reactions ?? 0));
  const comments = Math.max(0, Math.round(post.comments ?? 0));
  const reposts = Math.max(0, Math.round(post.reposts ?? 0));

  const total = reactions + comments * 2 + reposts * 3;
  if (total === 0) return 0;

  const engagement = logScale(total, 50_000);
  const depth = logScale(comments, 500);
  const shareRatio = logScale(reposts, 1_000);

  const c2r = reactions > 0 ? comments / reactions : 0;
  const discussion = Math.min(1, c2r / 0.3);

  let ageDays = 30;
  if (post.publishedAt) {
    const t = new Date(post.publishedAt).getTime();
    if (!Number.isNaN(t)) {
      ageDays = Math.max(0, (Date.now() - t) / 86_400_000);
    }
  }

  const recency = Math.max(0.25, Math.pow(2, -ageDays / 7));
  const freshness = Math.max(0, 1 - Math.min(1, ageDays / 90));

  const score =
    engagement * 45.0 +
    depth * 15.0 +
    shareRatio * 10.0 +
    discussion * 10.0 +
    recency * 12.0 +
    freshness * 8.0;

  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}
