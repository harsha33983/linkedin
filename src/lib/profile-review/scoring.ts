/**
 * Profile Scoring Engine
 *
 * Deterministic and explainable: the overall score is a weighted sum of
 * the per-section NLP scores using the weights in config.ts. Changing the
 * weights rebalances every report without touching the analysis code.
 */

import { PROFILE_REVIEW_CONFIG, getStrengthBand } from "./config";
import type { ProfileNLPReport } from "./nlp";

export interface CategoryScore {
  key: "headline" | "about" | "experience" | "skills" | "keywords" | "completeness" | "personalBrand";
  label: string;
  score: number; // 0-100
  weight: number; // 0-1
}

export interface OverallScore {
  overall: number; // 0-100
  weighted: number; // raw weighted sum before rounding
  categories: CategoryScore[];
  band: { key: string; label: string };
}

export function computeOverallScore(report: ProfileNLPReport): OverallScore {
  const weights = PROFILE_REVIEW_CONFIG.weights;

  const categories: CategoryScore[] = [
    { key: "headline", label: "Headline", score: report.headline.score, weight: weights.headline },
    { key: "about", label: "About", score: report.about.score, weight: weights.about },
    { key: "experience", label: "Experience", score: report.experience.score, weight: weights.experience },
    { key: "skills", label: "Skills", score: report.skills.score, weight: weights.skills },
    { key: "keywords", label: "Keywords", score: report.keywords.score, weight: weights.keywords },
    { key: "completeness", label: "Completeness", score: report.structure.score, weight: weights.completeness },
    { key: "personalBrand", label: "Personal Brand", score: report.personalBrand.score, weight: weights.personalBrand },
  ];

  const weighted = categories.reduce((sum, c) => sum + c.score * c.weight, 0);
  const overall = Math.max(0, Math.min(100, Math.round(weighted)));

  return {
    overall,
    weighted: Math.round(weighted * 100) / 100,
    categories,
    band: getStrengthBand(overall),
  };
}

/** Human-readable summary line for the report header. */
export function scoreSummaryLine(overall: number, bandLabel: string): string {
  if (overall >= 75) {
    return "Strong profile. A few refinements can improve visibility and recruiter appeal.";
  }
  if (overall >= 50) {
    return "Solid foundation, but there are clear opportunities to improve visibility and positioning.";
  }
  return "Your profile needs attention — the recommendations below will have the biggest impact.";
}