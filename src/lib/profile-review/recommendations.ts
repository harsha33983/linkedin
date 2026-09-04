/**
 * Recommendation Builder
 *
 * Turns NLP findings into structured, actionable recommendations.
 * Every recommendation has: problem, why it matters, recommended change,
 * example, priority, and category. Priorities are deterministic:
 * section score < 50 → HIGH, < 75 → MEDIUM, otherwise LOW (only surfaced
 * when an issue exists). Examples only ever generalize or ask the user for
 * missing facts — the AI never invents personal facts (enforced in ai.ts).
 */

import type { ProfileNLPReport, SectionIssue } from "./nlp";
import { computeOverallScore } from "./scoring";

export type Priority = "HIGH" | "MEDIUM" | "LOW";

export interface Recommendation {
  id: string;
  category: "headline" | "about" | "experience" | "skills" | "keywords" | "completeness" | "personalBrand";
  categoryLabel: string;
  priority: Priority;
  problem: string;
  why: string;
  recommendation: string;
  example?: string;
  /** Impact estimate: how much the overall score can improve if fixed. */
  impact: number;
}

function priorityForScore(score: number): Priority {
  if (score < 50) return "HIGH";
  if (score < 75) return "MEDIUM";
  return "LOW";
}

function toRecommendation(
  category: Recommendation["category"],
  categoryLabel: string,
  issue: SectionIssue,
  sectionScore: number,
  index: number
): Recommendation {
  return {
    id: `${category}-${index}`,
    category,
    categoryLabel,
    priority: priorityForScore(sectionScore),
    problem: issue.problem,
    why: issue.why,
    recommendation: issue.fix,
    example: issue.example,
    impact: Math.max(3, Math.min(15, Math.round((100 - sectionScore) / 10))),
  };
}

export function buildRecommendations(report: ProfileNLPReport): Recommendation[] {
  const recs: Recommendation[] = [];

  const addSection = (
    key: Recommendation["category"],
    label: string,
    analysis: { score: number; issues: SectionIssue[] }
  ) => {
    analysis.issues.forEach((issue, i) => {
      recs.push(toRecommendation(key, label, issue, analysis.score, i));
    });
  };

  addSection("headline", "Headline", report.headline);
  addSection("about", "About", report.about);
  addSection("experience", "Experience", report.experience);
  addSection("skills", "Skills", report.skills);
  addSection("completeness", "Profile Completeness", report.structure);
  addSection("personalBrand", "Personal Brand", report.personalBrand);

  // Keywords: surface as recommendations when coverage is weak
  if (report.keywords.score < 75) {
    recs.push({
      id: "keywords-0",
      category: "keywords",
      categoryLabel: "Keywords",
      priority: priorityForScore(report.keywords.score),
      problem:
        report.keywords.missingKeywords.length > 0
          ? `Key terms appear inconsistently across your profile (${report.keywords.missingKeywords.slice(0, 4).join(", ") || "several terms"}).`
          : "Keyword coverage across sections is thin.",
      why: "LinkedIn and external search match on keywords across headline, About, experience, and skills. Consistency multiplies visibility.",
      recommendation:
        "Repeat your 3–5 most important professional terms in at least two sections (headline + About, or skills + experience).",
      example: `If you're a ${report.headline.keywords[0] || "professional"}, use that term in your headline, About, and skills.`,
      impact: Math.max(5, Math.min(15, Math.round((100 - report.keywords.score) / 10))),
    });
  }

  // Sort by priority then impact, take top 5
  const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return recs
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || b.impact - a.impact)
    .slice(0, 5);
}

/** Top 3 highest-impact recommendations (for the summary section). */
export function topRecommendations(report: ProfileNLPReport) {
  const all = buildRecommendations(report);
  const { overall } = computeOverallScore(report);
  // If profile is strong, still show the top items (they exist only when issues exist)
  return all.slice(0, 3).map((r) => ({ ...r, overall }));
}