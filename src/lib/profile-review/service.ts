/**
 * Profile Review Service (orchestrator)
 *
 * collect → normalize → NLP → intelligence → AI → recommendations → scores → report
 *
 * The NLP + intelligence layers are always deterministic and free. The AI
 * layer enriches the report (executive summary, rewrites, content strategy)
 * when available and degrades gracefully otherwise. Every report is honest
 * about which layers ran and which profile fields were unavailable.
 */

import { analyzeProfileNLP, type NormalizedProfile } from "./nlp";
import { computeOverallScore } from "./scoring";
import { buildRecommendations, topRecommendations } from "./recommendations";
import { analyzeProfileWithAI } from "./ai";
import { buildProfileIntelligence } from "./intelligence";
import { profileToAnalysisInput, profileIdentitySummary } from "./normalize";
import { normalizeProfile } from "./nlp-helpers";
import { PROFILE_REVIEW_CONFIG } from "./config";
import type { NormalizedProfileData } from "./types";

export type { NormalizedProfile } from "./nlp";
export { normalizeProfile } from "./nlp-helpers";

export interface ProfileReviewResult {
  analysisId: string | null;
  profileUrl: string | null;
  username: string | null;
  usedAi: boolean;
  aiProvider: string | null;
  aiNotice: string | null;
  overallScore: number;
  band: { key: string; label: string };
  summaryLine: string;
  categories: { key: string; label: string; score: number; weight: number }[];
  sections: ReturnType<typeof analyzeProfileNLP>;
  recommendations: ReturnType<typeof buildRecommendations>;
  topRecommendations: ReturnType<typeof topRecommendations>;
  suggestions: Record<string, unknown>;
  intelligence: ReturnType<typeof buildProfileIntelligence>;
  dataSource: {
    source: string | null;
    retrievedAt: string | null;
    partial: boolean;
    missingFields: string[];
    notice: string | null;
  };
  identity: ReturnType<typeof profileIdentitySummary>;
  weights: typeof PROFILE_REVIEW_CONFIG.weights;
  analyzedAt: string;
  profileData: NormalizedProfile;
}

export interface ProfileReviewMeta {
  analysisId?: string | null;
  profileUrl?: string | null;
  username?: string | null;
  /** Provider/source metadata when data came from retrieval. */
  source?: string | null;
  retrievedAt?: string | null;
  partial?: boolean;
  missingFields?: string[];
  /** Structured data from a provider (for positions + intelligence). */
  providerData?: NormalizedProfileData | null;
}

export async function runProfileReview(
  profileInput: Partial<Omit<NormalizedProfile, "skills">> & { skills?: string[] | string },
  meta: ProfileReviewMeta = {}
): Promise<ProfileReviewResult> {
  const profileData = normalizeProfile(profileInput);

  // NLP (deterministic) — uses provider positions when available
  const nlp = analyzeProfileNLP(profileData, {
    positions: meta.providerData?.experience,
    hasPhoto: !!meta.providerData?.profilePhoto,
    hasLocation: !!meta.providerData?.location,
    certificationCount: meta.providerData?.certifications.length || 0,
    languageCount: meta.providerData?.languages.length || 0,
    projectCount: meta.providerData?.projects.length || 0,
    recommendationCount: meta.providerData?.recommendations.length || 0,
  });

  // Profile intelligence (deterministic)
  const intelligence = buildProfileIntelligence(
    meta.providerData || {
      profileUrl: meta.profileUrl || "",
      name: null,
      headline: profileData.headline,
      location: null,
      profilePhoto: null,
      about: profileData.about,
      currentPosition: null,
      experience: [],
      education: [],
      skills: profileData.skills,
      certifications: [],
      languages: [],
      projects: [],
      volunteering: [],
      recommendations: [],
      creatorInfo: null,
      publicMetrics: null,
      source: meta.source || "manual",
      retrievedAt: meta.retrievedAt || new Date().toISOString(),
      partial: false,
      missingFields: [],
    },
    nlp
  );

  // AI analysis (with safe fallback)
  const ai = await analyzeProfileWithAI({
    name: meta.providerData?.name || null,
    headline: profileData.headline,
    about: profileData.about,
    experience: profileData.experience,
    skills: profileData.skills,
    education: profileData.education,
    certifications: meta.providerData?.certifications || [],
    languages: meta.providerData?.languages || [],
    projects: meta.providerData?.projects || [],
  });

  // Recommendations + scores (deterministic, AI-independent)
  const recommendations = buildRecommendations(nlp);
  const top = topRecommendations(nlp);
  const scores = computeOverallScore(nlp);

  const suggestions: Record<string, unknown> = ai.usedAi
    ? (ai.suggestions as unknown as Record<string, unknown>)
    : {};

  // Partial-data notice (never a fake report)
  const partial = !!meta.partial;
  const missing = meta.missingFields || [];
  const dataNotice = partial
    ? `Analysis based on available profile information.${missing.length ? ` Not available: ${missing.slice(0, 5).join(", ")}.` : ""}`
    : null;

  const result: ProfileReviewResult = {
    analysisId: meta.analysisId ?? null,
    profileUrl: meta.profileUrl ?? null,
    username: meta.username ?? null,
    usedAi: ai.usedAi,
    aiProvider: ai.provider,
    aiNotice: ai.usedAi ? null : ai.error || null,
    overallScore: scores.overall,
    band: scores.band,
    summaryLine: scoreSummary(scores.overall, scores.band.label),
    categories: scores.categories.map((c) => ({ key: c.key, label: c.label, score: c.score, weight: c.weight })),
    sections: nlp,
    recommendations,
    topRecommendations: top,
    suggestions,
    intelligence,
    dataSource: {
      source: meta.source || null,
      retrievedAt: meta.retrievedAt || null,
      partial,
      missingFields: missing,
      notice: dataNotice,
    },
    identity: profileIdentitySummary(
      meta.providerData || {
        profileUrl: meta.profileUrl || "",
        name: null,
        headline: profileData.headline,
        location: null,
        profilePhoto: null,
        about: profileData.about,
        currentPosition: null,
        experience: [],
        education: [],
        skills: profileData.skills,
        certifications: [],
        languages: [],
        projects: [],
        volunteering: [],
        recommendations: [],
        creatorInfo: null,
        publicMetrics: null,
        source: meta.source || "manual",
        retrievedAt: meta.retrievedAt || new Date().toISOString(),
        partial: false,
        missingFields: [],
      }
    ),
    weights: PROFILE_REVIEW_CONFIG.weights,
    analyzedAt: new Date().toISOString(),
    profileData,
  };

  return result;
}

function scoreSummary(overall: number, bandLabel: string): string {
  if (overall >= 75) {
    return "Strong profile. A few refinements can improve visibility and recruiter appeal.";
  }
  if (overall >= 50) {
    return "Solid foundation, but there are clear opportunities to improve visibility and positioning.";
  }
  return "Your profile needs attention — the recommendations below will have the biggest impact.";
}