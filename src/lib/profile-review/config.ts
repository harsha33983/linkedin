/**
 * LinkedIn Profile Review — Configuration
 *
 * Scoring weights and free-usage limits are stored here so they can be
 * tuned without touching the analysis engine or the UI.
 */

export interface ScoreWeights {
  headline: number; // 0-1
  about: number;
  experience: number;
  skills: number;
  keywords: number;
  completeness: number;
  personalBrand: number;
}

/** Positive-integer env override with a fallback (limits stay configurable). */
function envLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const PROFILE_REVIEW_CONFIG = {
  /**
   * Free usage limits (configurable — do not hardcode elsewhere).
   * Anonymous users are limited per-day per-IP; authenticated users
   * get a monthly allowance.
   */
  limits: {
    // FREE_PROFILE_REVIEWS_PER_DAY / AUTH_PROFILE_REVIEWS_PER_MONTH override these.
    anonymousPerDay: envLimit("FREE_PROFILE_REVIEWS_PER_DAY", 3),
    authenticatedPerMonth: envLimit("AUTH_PROFILE_REVIEWS_PER_MONTH", 5),
    windowMs: {
      daily: 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
    },
  },

  /**
   * Deterministic scoring weights.
   * Sum = 1.0. Changing these rebalances the overall score everywhere.
   */
  weights: {
    headline: 0.15,
    about: 0.2,
    experience: 0.2,
    skills: 0.1,
    keywords: 0.1,
    completeness: 0.1,
    personalBrand: 0.15,
  } as ScoreWeights,

  /**
   * Strength bands for the overall score.
   */
  strengthBands: {
    critical: { min: 0, max: 49, label: "Critical" },
    needsImprovement: { min: 50, max: 74, label: "Needs Improvement" },
    strong: { min: 75, max: 100, label: "Strong" },
  },

  /**
   * NLP scoring thresholds (all deterministic, documented per check).
   */
  nlp: {
    headlineIdealLength: { min: 4, max: 12 }, // words — clear & specific
    aboutMinChars: 300,
    aboutIdealChars: { min: 500, max: 2600 },
    experienceBulletMinWords: 12,
    skillsIdealCount: { min: 5, max: 15 },
  },
} as const;

export type StrengthBand = keyof typeof PROFILE_REVIEW_CONFIG.strengthBands;

/** Resolve the strength band for a score (0-100). */
export function getStrengthBand(score: number): {
  key: StrengthBand;
  label: string;
} {
  const bands = PROFILE_REVIEW_CONFIG.strengthBands;
  if (score <= bands.critical.max) return { key: "critical", label: bands.critical.label };
  if (score <= bands.needsImprovement.max) return { key: "needsImprovement", label: bands.needsImprovement.label };
  return { key: "strong", label: bands.strong.label };
}