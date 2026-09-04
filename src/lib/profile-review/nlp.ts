/**
 * LinkedIn Profile NLP Analysis
 *
 * Deterministic, explainable rule-based analysis of profile sections.
 * Every score is derived from measurable features of the supplied text —
 * nothing is random. The AI layer (src/lib/profile-review/ai.ts) enriches
 * these findings with generated suggestions; the numbers come from here.
 */

import { PROFILE_REVIEW_CONFIG } from "./config";
import type { RawExperienceItem } from "./types";

// ─── Normalized profile shape ──────────────────────────────────

export interface NormalizedProfile {
  headline: string;
  about: string;
  experience: string; // free-form: one role per blank line, bullets below
  skills: string[]; // individual skill names
  education: string;
}

export interface SectionIssue {
  problem: string;
  why: string;
  fix: string;
  example?: string;
}

export interface SectionAnalysis {
  score: number; // 0-100
  strengths: string[];
  issues: SectionIssue[];
  keywords: string[]; // detected keywords
}

export interface KeywordAnalysis {
  score: number; // 0-100
  keywords: string[]; // present in profile
  missingKeywords: string[]; // recommended but absent
  coverage: { term: string; present: boolean; where: string[] }[];
}

export interface PositionAnalysis {
  company: string | null;
  role: string | null;
  duration: string | null;
  strengths: string[];
  weaknesses: string[];
  missingInfo: string[];
  recommendations: string[];
}

export interface ProfileNLPReport {
  headline: SectionAnalysis;
  about: SectionAnalysis;
  experience: SectionAnalysis;
  positions: PositionAnalysis[];
  skills: SectionAnalysis;
  keywords: KeywordAnalysis;
  personalBrand: SectionAnalysis;
  completeness: { present: string[]; missing: string[] };
  structure: SectionAnalysis;
}

// ─── Token helpers ─────────────────────────────────────────────

const ACTION_VERBS = [
  "led", "built", "launched", "grew", "managed", "created", "designed", "developed",
  "improved", "increased", "reduced", "delivered", "scaled", "architected", "owned",
  "drove", "spearheaded", "founded", "shipped", "optimized", "transformed", "negotiated",
  "mentored", "hired", "raised", "saved", "automated", "streamlined", "implemented",
];

const STORY_VERBS = [
  "discovered", "learned", "realized", "struggled", "started", "grew", "failed",
  "experimented", "tested", "iterated", "solved", "built", "changed",
];

const FILLER_WORDS = [
  "responsible for", "tasked with", "worked on", "helped with", "duties included",
  "very", "really", "quite", "highly motivated", "team player", "detail-oriented",
];

const CTA_PHRASES = [
  "connect", "reach out", "let's talk", "message me", "dm me", "follow me",
  "let's connect", "open to", "email me", "collaborate", "share your thoughts",
];

function words(text: string): string[] {
  return (text || "").toLowerCase().split(/[^a-z0-9+#.-]+/).filter(Boolean);
}

function countOccurrences(text: string, phrases: string[]): number {
  const lower = (text || "").toLowerCase();
  return phrases.filter((p) => lower.includes(p)).length;
}

function uniqueWords(text: string): Set<string> {
  return new Set(words(text));
}

/** Strip LinkedIn's public-URL noise like line separators. */
function clean(text: string): string {
  return (text || "").replace(/\r/g, "").trim();
}

/** Extract likely role keywords (nouns/noun-phrases) from a section. */
function extractKeywords(text: string, extraTerms: string[] = []): string[] {
  const all = words(text);
  const stop = new Set([
    "the", "a", "an", "and", "or", "but", "for", "with", "from", "to", "of", "in",
    "on", "at", "by", "as", "is", "are", "was", "were", "my", "our", "their", "i",
    "we", "you", "that", "this", "these", "those", "it", "its", "have", "has", "had",
    "about", "into", "over", "under", "more", "most", "than", "then", "when", "what",
  ]);
  const freq = new Map<string, number>();
  for (const w of all) {
    if (w.length < 3 || stop.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  for (const t of extraTerms) {
    const tLower = t.toLowerCase();
    if (tLower.length >= 3) freq.set(tLower, (freq.get(tLower) || 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);
}

// ─── Section analyzers ─────────────────────────────────────────

function analyzeHeadline(headline: string): SectionAnalysis {
  const text = clean(headline);
  const wc = words(text).length;
  const strengths: string[] = [];
  const issues: SectionIssue[] = [];
  const keywords: string[] = [];

  if (!text) {
    return {
      score: 0,
      strengths: [],
      issues: [
        {
          problem: "Your headline is empty.",
          why: "The headline is the most-viewed line of your profile — it shows up in search results, connection requests, and comments.",
          fix: "Add a headline that states your role plus your specialization in 4–12 words.",
          example: "Software Engineer | AI & SaaS | Building scalable developer tools",
        },
      ],
      keywords: [],
    };
  }

  // Length
  if (wc >= PROFILE_REVIEW_CONFIG.nlp.headlineIdealLength.min && wc <= PROFILE_REVIEW_CONFIG.nlp.headlineIdealLength.max) {
    strengths.push(`Clear, scannable length (${wc} words).`);
  } else if (wc < PROFILE_REVIEW_CONFIG.nlp.headlineIdealLength.min) {
    issues.push({
      problem: `Your headline is short (${wc} words) and may not explain your specialization.`,
      why: "Recruiters scan headlines in milliseconds — a bare title leaves your value proposition unstated.",
      fix: "Expand it to 4–12 words that include your role, specialization, and an outcome or audience.",
      example: "Product Manager | Fintech | Turning compliance complexity into growth",
    });
  } else {
    issues.push({
      problem: `Your headline is long (${wc} words).`,
      why: "LinkedIn truncates long headlines in search results and on mobile.",
      fix: "Cut it to the 4–12 most important words; move the rest to your About section.",
    });
  }

  // Keyword presence (role markers)
  const roleMarkers = ["engineer", "developer", "manager", "designer", "founder", "consultant", "analyst", "scientist", "architect", "marketer", "sales", "product", "director", "lead", "head", "ceo", "cto", "coo", "cmo", "owner", "freelancer", "writer", "editor", "strategist", "researcher", "data"];
  const foundRoles = roleMarkers.filter((r) => text.toLowerCase().includes(r));
  if (foundRoles.length > 0) {
    strengths.push(`Clearly names your role (${foundRoles.slice(0, 2).join(", ")}).`);
    keywords.push(...foundRoles.slice(0, 2));
  } else {
    issues.push({
      problem: "Your headline doesn't state a recognizable role or function.",
      why: "Search and recruiters match on role keywords — without one, your profile is harder to find.",
      fix: "Lead with your role title, then your specialization.",
      example: "Content Strategist | B2B SaaS | Helping founders build audiences",
    });
  }

  // Value proposition / specificity
  const hasSpecialization = /[|·•–—:,]/.test(text) || text.split(/\s/).length >= 6;
  if (hasSpecialization) {
    strengths.push("Communicates a specialization beyond the job title.");
  } else {
    issues.push({
      problem: "Your headline describes a title but not your specialization or value.",
      why: "Visitors can't tell what makes you different — or who you serve.",
      fix: "Add your niche, your outcome, or the audience you help.",
      example: "Staff Engineer | AI & Developer Tools | Helping teams ship faster",
    });
  }

  // Industry keyword coverage
  const industryTerms = extractKeywords(text);
  if (industryTerms.length >= 2) keywords.push(...industryTerms);

  // Score: deterministic weighting of the checks above
  let score = 100;
  if (wc < 4 || wc > 12) score -= 15;
  if (foundRoles.length === 0) score -= 30;
  if (!hasSpecialization) score -= 20;
  if (industryTerms.length < 2) score -= 15;
  score = Math.max(5, Math.min(95, score));
  if (score >= 70 && issues.length === 0) score = 100; // reserve 100 for flawless
  if (score >= 70) strengths.push("Strong positioning for search visibility.");

  return { score, strengths, issues, keywords: Array.from(new Set(keywords)) };
}

function analyzeAbout(about: string): SectionAnalysis {
  const text = clean(about);
  const charCount = text.length;
  const strengths: string[] = [];
  const issues: SectionIssue[] = [];
  const keywords: string[] = [];

  if (!text) {
    return {
      score: 0,
      strengths: [],
      issues: [
        {
          problem: "Your About section is empty.",
          why: "About is where you convert visitors into followers, clients, and opportunities.",
          fix: "Write 2–5 short paragraphs: who you help, what you do, proof, and a call to action.",
        },
      ],
      keywords: [],
    };
  }

  if (charCount >= PROFILE_REVIEW_CONFIG.nlp.aboutMinChars) {
    strengths.push("Substantial enough to communicate your story and keywords.");
  } else {
    issues.push({
      problem: `Your About section is thin (${charCount} characters).`,
      why: "Short About sections give search and visitors very little to work with.",
      fix: `Expand it to at least ${PROFILE_REVIEW_CONFIG.nlp.aboutMinChars} characters.`,
    });
  }

  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const opening = sentences[0] || "";
  const openingWords = words(opening);
  const strongOpening =
    /^(i (help|build|work|specialize|teach|write|design|create)|i'm|i am|as a|after \d+|over \d+)/i.test(opening) ||
    openingWords.length >= 8;
  if (strongOpening) {
    strengths.push("Opens with a clear, purpose-driven first line.");
  } else {
    issues.push({
      problem: "Your About section doesn't open with a strong value statement.",
      why: "The first two lines decide whether visitors keep reading.",
      fix: "Start with who you help and the outcome you deliver, not your job history.",
      example: "I help early-stage founders turn product ideas into shipped software — without burning out their team.",
    });
  }

  // Expertise & keywords
  const expertiseMarkers = ["expert", "specialize", "focus", "experienced", "years", "deep", "built", "led", "delivered", "results", "portfolio", "certified"];
  const expertiseHits = expertiseMarkers.filter((m) => text.toLowerCase().includes(m));
  if (expertiseHits.length >= 2) {
    strengths.push("Demonstrates expertise with concrete markers.");
  } else {
    issues.push({
      problem: "Your About section doesn't clearly signal your expertise level.",
      why: "Visitors need signals like years, focus areas, or outcomes to assess credibility.",
      fix: "Add your years of experience, specialization, or notable outcomes.",
    });
  }

  // Storytelling
  const storyHits = countOccurrences(text, STORY_VERBS);
  if (storyHits >= 2) {
    strengths.push("Uses narrative elements that make the profile memorable.");
  } else {
    issues.push({
      problem: "Your About section reads like a list rather than a story.",
      why: "Stories make you memorable to recruiters and clients.",
      fix: "Add a short paragraph about why you do what you do or a challenge you solved.",
    });
  }

  // CTA
  const ctaHits = countOccurrences(text, CTA_PHRASES);
  if (ctaHits > 0) {
    strengths.push("Includes a call to action for visitors.");
  } else {
    issues.push({
      problem: "Your About section has no call to action.",
      why: "Without a CTA, interested visitors don't know what you want them to do.",
      fix: "Close with an invitation: connect, DM, follow, or email.",
      example: "Open to consulting — DM me or email hello@yourdomain.com.",
    });
  }

  // Readability (filler words & walls of text)
  const fillerHits = countOccurrences(text, FILLER_WORDS);
  if (fillerHits > 0) {
    issues.push({
      problem: `Uses filler phrases (${fillerHits} found) that weaken impact.`,
      why: "Phrases like 'responsible for' and 'team player' add words without information.",
      fix: "Replace them with concrete actions and outcomes.",
    });
  }
  if (sentences.length > 0 && sentences.length <= 6) {
    strengths.push("Keeps paragraphs short and scannable.");
  } else if (sentences.length > 10) {
    issues.push({
      problem: "About is dense — hard to skim on mobile.",
      why: "Most visitors skim; walls of text lose them.",
      fix: "Break it into short paragraphs with line breaks every 1–3 sentences.",
    });
  }

  keywords.push(...extractKeywords(text));

  let score = 100;
  if (charCount < PROFILE_REVIEW_CONFIG.nlp.aboutMinChars) score -= 25;
  if (!strongOpening) score -= 20;
  if (expertiseHits.length < 2) score -= 15;
  if (storyHits < 2) score -= 10;
  if (ctaHits === 0) score -= 15;
  if (fillerHits > 0) score -= 5;
  score = Math.max(5, Math.min(score, 100));

  return { score, strengths, issues, keywords: Array.from(new Set(keywords)) };
}

function analyzeExperience(experience: string): SectionAnalysis {
  const text = clean(experience);
  const strengths: string[] = [];
  const issues: SectionIssue[] = [];
  const keywords: string[] = [];

  if (!text) {
    return {
      score: 0,
      strengths: [],
      issues: [
        {
          problem: "No experience information provided.",
          why: "Experience is the strongest credibility signal on a LinkedIn profile.",
          fix: "Add your roles with 2–4 achievement-focused bullets each.",
        },
      ],
      keywords: [],
    };
  }

  // Roles & bullets
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-•*▪]/.test(l) || /^\d+[.)]/.test(l));
  const roleLines = lines.filter((l) => !/^[-•*▪]/.test(l) && !/^\d+[.)]/.test(l));

  if (roleLines.length >= 2) {
    strengths.push("Multiple roles listed — good career depth.");
  }

  // Quantification
  const quantified = text.match(/\d+%|\$\s?\d+|\d+\s*(million|k|users|customers|clients|people|revenue|requests|deploys|projects)/i);
  if (quantified) {
    strengths.push("Includes quantified outcomes (measurable results).");
  } else {
    issues.push({
      problem: "No quantified results found in your experience.",
      why: "Metrics are the fastest credibility signal for recruiters.",
      fix: "Add numbers where true: scale, revenue, users, speed, cost, or team size.",
      example: "Cut deployment time by 40% by automating CI/CD.",
    });
  }

  // Action verbs
  const actionHits = new Set(words(text).filter((w) => ACTION_VERBS.includes(w)));
  const actionHitsArr = Array.from(actionHits);
  if (actionHitsArr.length >= 3) {
    strengths.push(`Strong action verbs: ${actionHitsArr.slice(0, 4).join(", ")}.`);
  } else {
    issues.push({
      problem: "Experience bullets rely on weak or passive language.",
      why: "Action verbs signal ownership and impact; passive phrases don't.",
      fix: "Start each bullet with a strong verb: led, built, launched, grew, improved.",
    });
  }

  // Outcomes vs responsibilities
  const outcomeMarkers = ["increased", "reduced", "improved", "grew", "saved", "delivered", "launched", "built", "led", "scaled", "won", "awarded", "results"];
  const outcomeHits = outcomeMarkers.filter((m) => text.toLowerCase().includes(m)).length;
  if (outcomeHits >= 3) {
    strengths.push("Focuses on outcomes, not just responsibilities.");
  } else {
    issues.push({
      problem: "Experience reads like a responsibilities list.",
      why: "Recruiters want outcomes: what changed because you were there?",
      fix: "For each bullet, answer 'what happened as a result?'",
    });
  }

  // Keyword relevance
  keywords.push(...extractKeywords(text, ["experience"]));

  let score = 100;
  if (!quantified) score -= 25;
  if (actionHitsArr.length < 3) score -= 20;
  if (outcomeHits < 3) score -= 15;
  if (bullets.length === 0) score -= 15;
  if (roleLines.length < 2) score -= 10;
  score = Math.max(5, Math.min(score, 100));

  return { score, strengths, issues, keywords: Array.from(new Set(keywords)) };
}

function analyzeSkills(skills: string[], headlineKeywords: string[]): SectionAnalysis {
  const cleanSkills = skills.map((s) => s.trim()).filter(Boolean);
  const strengths: string[] = [];
  const issues: SectionIssue[] = [];
  const keywords: string[] = [];

  if (cleanSkills.length === 0) {
    return {
      score: 0,
      strengths: [],
      issues: [
        {
          problem: "No skills listed.",
          why: "Skills power LinkedIn search, recruiter filtering, and 'top skills' badges.",
          fix: "List 5–15 skills that match your headline and experience.",
        },
      ],
      keywords: [],
    };
  }

  const { min, max } = PROFILE_REVIEW_CONFIG.nlp.skillsIdealCount;
  if (cleanSkills.length >= min && cleanSkills.length <= max) {
    strengths.push(`Good skill count (${cleanSkills.length}) — enough to be searchable without looking padded.`);
  } else if (cleanSkills.length > max) {
    issues.push({
      problem: `Large skill list (${cleanSkills.length}) can dilute your positioning.`,
      why: "LinkedIn shows only your top 3 skills prominently; a huge list spreads keyword weight thin.",
      fix: "Curate the 10–15 skills most relevant to your target role.",
    });
  } else {
    issues.push({
      problem: `Only ${cleanSkills.length} skill(s) listed.`,
      why: "Fewer than 5 skills makes your profile hard to find in skill-based search.",
      fix: `Add at least ${min} relevant skills.`,
    });
  }

  // Coverage of headline keywords
  const covered = headlineKeywords.filter((k) => cleanSkills.some((s) => s.toLowerCase().includes(k)));
  if (covered.length >= 2) {
    strengths.push("Skills reinforce your headline keywords.");
  } else if (headlineKeywords.length > 0) {
    issues.push({
      problem: "Your skills don't cover the keywords in your headline.",
      why: "Inconsistent keywords weaken your search relevance.",
      fix: "Add the tools and domains named in your headline as skills.",
    });
  }

  keywords.push(...cleanSkills.slice(0, 12).map((s) => s.toLowerCase()));

  let score = 100;
  if (cleanSkills.length < min || cleanSkills.length > max) score -= 20;
  if (headlineKeywords.length > 0 && covered.length < 2) score -= 20;
  score = Math.max(5, Math.min(score, 100));

  return { score, strengths, issues, keywords: Array.from(new Set(keywords)) };
}

function analyzeKeywords(profile: NormalizedProfile): KeywordAnalysis {
  const allText = [profile.headline, profile.about, profile.experience, profile.skills.join(", ")]
    .map((s) => s.toLowerCase())
    .join(" \n ");

  // Candidate keyword terms: headline + about keywords + skill names
  const headlineTerms = extractKeywords(profile.headline);
  const aboutTerms = extractKeywords(profile.about);
  const skillTerms = profile.skills.map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 3);

  const candidates: string[] = [];
  for (const t of [...headlineTerms, ...aboutTerms, ...skillTerms]) {
    if (!candidates.includes(t)) candidates.push(t);
  }

  const coverage = candidates.slice(0, 10).map((term) => {
    const where: string[] = [];
    if (profile.headline.toLowerCase().includes(term)) where.push("headline");
    if (profile.about.toLowerCase().includes(term)) where.push("about");
    if (profile.experience.toLowerCase().includes(term)) where.push("experience");
    if (profile.skills.some((s) => s.toLowerCase().includes(term))) where.push("skills");
    return { term, present: where.length > 0, where };
  });

  const present = coverage.filter((c) => c.present).map((c) => c.term);
  const missing = coverage.filter((c) => !c.present).map((c) => c.term);

  // A term is "covered" if it appears in 2+ sections, or in skills + 1 other.
  const wellCovered = coverage.filter(
    (c) => c.where.length >= 2 || (c.present && c.where.includes("skills"))
  ).length;

  const score = Math.max(
    5,
    Math.min(100, Math.round((wellCovered / Math.max(coverage.length, 1)) * 100))
  );

  return { score, keywords: present, missingKeywords: missing, coverage };
}

function analyzePersonalBrand(profile: NormalizedProfile, sectionScores: Record<string, number>): SectionAnalysis {
  const strengths: string[] = [];
  const issues: SectionIssue[] = [];
  const keywords: string[] = [];
  const missing: string[] = [];

  if (!profile.headline.trim()) missing.push("Headline");
  if (!profile.about.trim()) missing.push("About section");
  if (!profile.experience.trim()) missing.push("Experience");
  if (profile.skills.length === 0) missing.push("Skills");

  // Positioning consistency: does the about reinforce the headline?
  const headlineKeywords = extractKeywords(profile.headline);
  const aboutLower = profile.about.toLowerCase();
  const reinforced = headlineKeywords.filter((k) => aboutLower.includes(k));
  if (reinforced.length >= 2) {
    strengths.push("Consistent positioning: your About reinforces your headline keywords.");
  } else {
    issues.push({
      problem: "Your About section doesn't reinforce your headline positioning.",
      why: "A consistent keyword story across headline → About → experience is what makes positioning stick.",
      fix: "Weave your headline's key terms into the first lines of About.",
    });
  }

  // Audience clarity
  const audienceMarkers = ["i help", "i work with", "founders", "startups", "teams", "clients", "companies", "students", "for ", "audience"];
  const audienceHits = audienceMarkers.filter((m) => aboutLower.includes(m));
  if (audienceHits.length > 0) {
    strengths.push("Clearly identifies who you serve.");
  } else {
    issues.push({
      problem: "Your profile doesn't clearly state who you help.",
      why: "Profiles that name an audience attract the right opportunities faster.",
      fix: "Name your audience in the first line of About.",
      example: "I help SaaS founders turn product ideas into shipped software.",
    });
  }

  if (missing.length > 0) {
    issues.push({
      problem: `Incomplete profile: missing ${missing.join(", ")}.`,
      why: "Completeness is a credibility signal — incomplete profiles are filtered out.",
      fix: "Fill in every section before relying on the profile for opportunities.",
    });
  }

  keywords.push(...extractKeywords(profile.about));

  // Brand score ties into the other sections (deterministic)
  const avgOthers = (sectionScores.headline + sectionScores.about + sectionScores.experience) / 3;
  let score = Math.round(avgOthers * 0.6);
  if (reinforced.length >= 2) score += 20;
  if (audienceHits.length > 0) score += 10;
  if (missing.length === 0) score += 10;
  score = Math.max(5, Math.min(score, 100));

  return { score, strengths, issues, keywords: Array.from(new Set(keywords)) };
}

// ─── Per-position experience analysis ──────────────────────────

export function analyzeExperiencePositions(experience: RawExperienceItem[]): PositionAnalysis[] {
  return experience.map((e) => {
    const text = [e.role, e.company, e.duration, e.description, ...e.bullets].filter(Boolean).join(" \n ");
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const missingInfo: string[] = [];
    const recommendations: string[] = [];

    if (e.role) strengths.push(`Clearly communicates role: ${e.role}.`);
    else missingInfo.push("Role title");
    if (e.company) strengths.push(`Names the company: ${e.company}.`);
    else missingInfo.push("Company");
    if (e.startDate || e.endDate || e.duration) strengths.push("Includes time period.");
    else missingInfo.push("Time period");

    const actionHits = new Set(words(text).filter((w) => ACTION_VERBS.includes(w)));
    if (actionHits.size >= 2) strengths.push(`Action verbs: ${Array.from(actionHits).slice(0, 3).join(", ")}.`);
    else {
      weaknesses.push("Bullets don't start with strong action verbs.");
      recommendations.push("Start each bullet with a strong verb: led, built, launched, grew, improved.");
    }

    const quantified = /\d+%|\$\s?\d+|\d+\s*(million|k|users|customers|clients|people|revenue|requests|deploys|projects|%|x\b)/i.test(text);
    if (quantified) strengths.push("Includes measurable outcomes.");
    else {
      weaknesses.push("No measurable outcomes — impact isn't quantified.");
      recommendations.push("Add measurable outcomes where available (scale, revenue, speed, cost, team size).");
      missingInfo.push("Measurable outcomes");
    }

    const outcomeHits = ["increased", "reduced", "improved", "grew", "saved", "delivered", "launched", "built", "led", "scaled", "won"].filter((m) =>
      text.toLowerCase().includes(m)
    ).length;
    if (outcomeHits >= 2) strengths.push("Focuses on outcomes rather than responsibilities.");
    else {
      weaknesses.push("Reads like responsibilities rather than outcomes.");
      recommendations.push("Answer 'what changed because you were there?' for each bullet.");
    }

    if (weaknesses.length === 0) strengths.push("Well-structured, achievement-oriented entry.");
    if (missingInfo.length > 0) {
      recommendations.push(`Add missing information: ${missingInfo.join(", ")}.`);
    }

    return {
      company: e.company,
      role: e.role,
      duration: e.duration || (e.startDate ? `${e.startDate}${e.endDate ? ` - ${e.endDate}` : ""}` : null),
      strengths,
      weaknesses,
      missingInfo,
      recommendations,
    };
  });
}

// ─── Profile structure / completeness ──────────────────────────

const STRUCTURE_FIELDS: { key: string; label: string; weight: number }[] = [
  { key: "headline", label: "Headline", weight: 2 },
  { key: "about", label: "About section", weight: 2 },
  { key: "experience", label: "Experience", weight: 2 },
  { key: "skills", label: "Skills", weight: 1 },
  { key: "education", label: "Education", weight: 1 },
  { key: "photo", label: "Profile photo", weight: 1 },
  { key: "location", label: "Location", weight: 1 },
  { key: "certifications", label: "Certifications", weight: 0.5 },
  { key: "languages", label: "Languages", weight: 0.5 },
  { key: "projects", label: "Projects", weight: 0.5 },
  { key: "recommendations", label: "Recommendations", weight: 0.5 },
];

export function analyzeStructure(profile: NormalizedProfile, extra: {
  hasPhoto: boolean;
  hasLocation: boolean;
  certificationCount: number;
  languageCount: number;
  projectCount: number;
  recommendationCount: number;
}): SectionAnalysis {
  const present: Record<string, boolean> = {
    headline: !!profile.headline.trim(),
    about: !!profile.about.trim(),
    experience: !!profile.experience.trim(),
    skills: profile.skills.length > 0,
    education: !!profile.education.trim(),
    photo: extra.hasPhoto,
    location: extra.hasLocation,
    certifications: extra.certificationCount > 0,
    languages: extra.languageCount > 0,
    projects: extra.projectCount > 0,
    recommendations: extra.recommendationCount > 0,
  };

  const strengths: string[] = [];
  const issues: SectionIssue[] = [];
  const missing: string[] = [];
  let total = 0;
  let earned = 0;

  for (const field of STRUCTURE_FIELDS) {
    total += field.weight;
    if (present[field.key]) {
      earned += field.weight;
      strengths.push(`${field.label} present.`);
    } else {
      missing.push(field.label);
    }
  }

  if (missing.length > 0) {
    issues.push({
      problem: `Profile is missing: ${missing.join(", ")}.`,
      why: "Completeness is a credibility and search signal — every missing section reduces the information search and visitors can use.",
      fix: "Fill in the missing sections with accurate information.",
    });
  }

  const score = Math.max(5, Math.min(100, Math.round((earned / Math.max(total, 1)) * 100)));

  return { score, strengths, issues, keywords: [] };
}

// ─── Completeness ──────────────────────────────────────────────

export function analyzeCompleteness(profile: NormalizedProfile): {
  present: string[];
  missing: string[];
} {
  const present: string[] = [];
  const missing: string[] = [];
  if (profile.headline.trim()) present.push("Headline");
  else missing.push("Headline");
  if (profile.about.trim()) present.push("About");
  else missing.push("About");
  if (profile.experience.trim()) present.push("Experience");
  else missing.push("Experience");
  if (profile.skills.length > 0) present.push("Skills");
  else missing.push("Skills");
  if (profile.education.trim()) present.push("Education");
  else missing.push("Education");
  return { present, missing };
}

// ─── Entry point ───────────────────────────────────────────────

export function analyzeProfileNLP(
  profile: NormalizedProfile,
  extra?: {
    positions?: RawExperienceItem[];
    hasPhoto?: boolean;
    hasLocation?: boolean;
    certificationCount?: number;
    languageCount?: number;
    projectCount?: number;
    recommendationCount?: number;
  }
): ProfileNLPReport {
  const headline = analyzeHeadline(profile.headline);
  const about = analyzeAbout(profile.about);
  const experience = analyzeExperience(profile.experience);
  const positions = extra?.positions ? analyzeExperiencePositions(extra.positions) : [];
  const skills = analyzeSkills(profile.skills, headline.keywords);
  const keywords = analyzeKeywords(profile);
  const personalBrand = analyzePersonalBrand(profile, {
    headline: headline.score,
    about: about.score,
    experience: experience.score,
    skills: skills.score,
  });
  const completeness = analyzeCompleteness(profile);
  const structure = analyzeStructure(profile, {
    hasPhoto: !!extra?.hasPhoto,
    hasLocation: !!extra?.hasLocation,
    certificationCount: extra?.certificationCount || 0,
    languageCount: extra?.languageCount || 0,
    projectCount: extra?.projectCount || 0,
    recommendationCount: extra?.recommendationCount || 0,
  });

  return {
    headline,
    about,
    experience,
    positions,
    skills,
    keywords,
    personalBrand,
    completeness,
    structure,
  };
}