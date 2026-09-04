/**
 * Profile Intelligence (rule-based)
 *
 * Deterministic, evidence-based inferences from the normalized profile.
 * Never invents facts: every output derives from supplied data, and
 * low-confidence outputs are marked as suggestions. No sensitive personal
 * characteristics are inferred.
 */

import type { NormalizedProfileData } from "./types";
import type { ProfileNLPReport } from "./nlp";

export interface ProfileIntelligence {
  professionalIdentity: string;
  primaryExpertise: string[];
  secondaryExpertise: string[];
  industry: string | null;
  careerLevel: string | null;
  likelyTargetRoles: string[];
  positioning: string;
  keywordClusters: { cluster: string; keywords: string[] }[];
  brandThemes: string[];
  potentialAudience: string | null;
  contentPillars: string[];
  contentIdeas: string[];
  thirtyDayPlan: { week: string; focus: string; actions: string[] }[];
}

const INDUSTRY_KEYWORDS: [string, string[]][] = [
  ["Technology / Software", ["software", "engineer", "developer", "saas", "cloud", "data", "ai", "ml", "platform", "full-stack", "backend", "frontend", "devops", "security", "product"]],
  ["Finance", ["finance", "bank", "invest", "fintech", "capital", "equity", "accounting", "risk"]],
  ["Healthcare", ["health", "medical", "clinical", "pharma", "biotech", "patient"]],
  ["Education", ["education", "teaching", "professor", "curriculum", "student", "learning"]],
  ["Marketing / Media", ["marketing", "content", "brand", "media", "seo", "social", "creative", "copy"]],
  ["Sales / Business", ["sales", "business development", "account", "revenue", "growth", "partnership"]],
  ["Consulting", ["consult", "strategy", "advisory", "analyst"]],
  ["Operations / HR", ["operations", "hr", "talent", "recruiting", "people", "administration"]],
  ["Design / Creative", ["design", "ux", "ui", "creative", "product design"]],
];

const LEVEL_MARKERS: [string, string[]][] = [
  ["Executive", ["ceo", "cto", "cfo", "cmo", "coo", "founder", "co-founder", "owner", "president", "vp", "vice president", "head of", "chief"]],
  ["Senior / Lead", ["senior", "staff", "principal", "lead", "director", "manager", "head"]],
  ["Mid-level", ["engineer", "developer", "analyst", "designer", "specialist", "consultant", "associate"]],
  ["Entry / Junior", ["junior", "intern", "trainee", "graduate", "assistant"]],
];

function matchKeywords(text: string, map: [string, string[]][]): string[] {
  const lower = text.toLowerCase();
  return map.filter(([, kws]) => kws.some((k) => lower.includes(k))).map(([label]) => label);
}

export function buildProfileIntelligence(
  data: NormalizedProfileData,
  nlp: ProfileNLPReport
): ProfileIntelligence {
  const headline = data.headline || "";
  const about = data.about || "";
  const allText = [headline, about, ...data.experience.map((e) => [e.role, e.company, e.description].filter(Boolean).join(" "))]
    .join(" \n ")
    .toLowerCase();

  // Identity
  const current = data.currentPosition || data.experience[0] || null;
  const professionalIdentity =
    headline.trim() ||
    [current?.role, current?.company].filter(Boolean).join(" at ") ||
    (data.name ? `${data.name}'s professional profile` : "Professional profile");

  // Expertise: skills first, then role/headline keywords
  const primaryExpertise = data.skills.slice(0, 5);
  const secondaryExpertise = data.skills.slice(5, 12);

  // Industry + career level
  const industries = matchKeywords(allText, INDUSTRY_KEYWORDS);
  const industry = industries[0] || null;
  const levels = matchKeywords(allText, LEVEL_MARKERS);
  const careerLevel = levels[0] || null;

  // Target roles — split on real segment separators (pipe, comma, middot,
  // bullet, standalone dashes), never inside words like "Full-Stack".
  const roleWords = (headline + " " + (current?.role || ""))
    .split(/[|,·•]/)
    .map((s) => s.trim().replace(/^[-—–]\s*|\s*[-—–]$/g, "").trim())
    .map((s) => s.split(/\s+[-—–]\s+|\s+[-—–]\s*/).map((p) => p.trim()).filter(Boolean).join(" "))
    .filter((s) => s.length > 1)
    .slice(0, 3);
  const likelyTargetRoles = roleWords.length > 0
    ? roleWords.map((r) => r.replace(/\s+/g, " "))
    : (current?.role ? [current.role] : []);

  // Keyword clusters
  const skillSet = new Set(data.skills.map((s) => s.toLowerCase()));
  const roleCluster = nlp.headline.keywords.filter((k) => !skillSet.has(k)).slice(0, 5);
  const skillCluster = data.skills.slice(0, 6);
  const aboutCluster = nlp.about.keywords.filter((k) => !skillSet.has(k) && !roleCluster.includes(k)).slice(0, 5);
  const industryCluster = industries.length ? industries : [];
  const keywordClusters = [
    { cluster: "Role", keywords: roleCluster },
    { cluster: "Skills", keywords: skillCluster },
    { cluster: "Positioning", keywords: aboutCluster },
    { cluster: "Industry", keywords: industryCluster },
  ].filter((c) => c.keywords.length > 0);

  // Brand themes from personal brand analysis + about
  const brandThemes: string[] = [];
  if (nlp.personalBrand.strengths.length > 0) {
    brandThemes.push(...nlp.personalBrand.strengths.slice(0, 2).map((s) => s.replace(/\.$/, "")));
  }
  const audienceMatch = about.match(/i (?:help|work with|serve|support|build for)\s+([^.]+)/i);
  if (audienceMatch) brandThemes.push(`Serves ${audienceMatch[1].trim()}`);
  if (primaryExpertise.length) brandThemes.push(`Expertise in ${primaryExpertise.slice(0, 3).join(", ")}`);
  if (brandThemes.length === 0) brandThemes.push("Professional profile needs clearer positioning");

  // Audience
  const potentialAudience = audienceMatch ? audienceMatch[1].trim() : null;

  // Content pillars: 3-5 from expertise + industry + role
  const pillars = buildContentPillars(data, primaryExpertise, industry, current?.role || null);

  // Content ideas (10) — rule-based, grounded in actual data
  const contentIdeas = buildContentIdeas(data, pillars, potentialAudience);

  // 30-day plan
  const thirtyDayPlan = buildThirtyDayPlan(data, pillars);

  return {
    professionalIdentity,
    primaryExpertise,
    secondaryExpertise,
    industry,
    careerLevel,
    likelyTargetRoles,
    positioning: headline || (data.name ? `${data.name}'s professional profile` : "Unknown positioning"),
    keywordClusters,
    brandThemes: Array.from(new Set(brandThemes)).slice(0, 5),
    potentialAudience,
    contentPillars: pillars,
    contentIdeas,
    thirtyDayPlan,
  };
}

function buildContentPillars(
  data: NormalizedProfileData,
  expertise: string[],
  industry: string | null,
  role: string | null
): string[] {
  const pillars: string[] = [];
  const roleBase = role ? role.replace(/^(senior|staff|principal|lead|head|junior|associate|chief|vp|vice president)\s+/i, "") : null;

  if (expertise.length >= 2) pillars.push(`${expertise[0]} & ${expertise[1]} Insights`);
  if (roleBase && expertise.length) pillars.push(`${roleBase} Lessons & Best Practices`);
  if (industry) pillars.push(`${industry} Trends & Analysis`);
  if (data.experience.length >= 2) pillars.push("Career Growth & Lessons Learned");
  pillars.push("Productivity & Professional Development");

  return Array.from(new Set(pillars)).slice(0, 5);
}

function buildContentIdeas(
  data: NormalizedProfileData,
  pillars: string[],
  audience: string | null
): string[] {
  const aud = audience ? audience.trim() : "professionals in your field";
  const role = data.currentPosition?.role || data.experience[0]?.role || "professional";
  const company = data.currentPosition?.company || data.experience[0]?.company || null;
  const skill = data.skills[0] || null;
  const exp = data.experience[0] || null;

  const ideas: string[] = [
    `Lessons from my journey as a ${role}${company ? ` at ${company}` : ""} — what I'd tell my younger self`,
    audience ? `How I help ${aud} solve their biggest ${pillars[0]?.toLowerCase() || "challenges"} problem` : `What most ${role}s get wrong about ${pillars[0]?.toLowerCase() || "their craft"}`,
    skill ? `One ${skill} technique that changed how I work` : `My daily workflow as a ${role}`,
    exp?.bullets[0] ? `Behind the scenes: ${exp.bullets[0].replace(/^[-•*▪]\s*/, "")}` : `The ${role} toolkit: tools I actually use`,
    `3 things I wish I knew before becoming a ${role}`,
    pillars[1] ? `Why ${pillars[1].toLowerCase()} matters more than ever` : `A honest look at ${role} career growth`,
    company ? `What building at ${company} taught me about ${pillars[0]?.toLowerCase() || "my work"}` : `How I stay sharp as a ${role}`,
    `The question every ${role} should ask before ${skill ? `adopting ${skill}` : "their next project"}`,
    `My framework for ${pillars[0]?.toLowerCase() || "getting things done"} — step by step`,
    `Common myths about ${role}s, debunked from experience`,
  ];

  return ideas.slice(0, 10);
}

function buildThirtyDayPlan(
  data: NormalizedProfileData,
  pillars: string[]
): { week: string; focus: string; actions: string[] }[] {
  const role = data.currentPosition?.role || data.experience[0]?.role || "your role";
  const pillar = pillars[0] || "your expertise";

  return [
    {
      week: "Week 1",
      focus: "Fix profile fundamentals",
      actions: [
        "Update your headline to state your role and specialization in 4–12 words (see suggestions in this report).",
        "Fill any missing sections: About, skills, experience, education.",
        "Write a one-line value statement for the top of your About.",
      ],
    },
    {
      week: "Week 2",
      focus: "Improve positioning",
      actions: [
        "Rewrite your About opening around who you help and the outcome you deliver.",
        role && role !== "your role"
          ? `Add measurable outcomes to your ${role} experience bullets where true.`
          : "Add measurable outcomes to your experience bullets where true.",
        "Align your top 5 skills with your headline keywords.",
      ],
    },
    {
      week: "Week 3",
      focus: `Create your ${pillar.toLowerCase()} content pillars`,
      actions: [
        `Draft 3–5 posts on ${pillar.toLowerCase()}.`,
        "Repurpose 2–3 past projects or lessons into stories.",
        "Follow and engage with 10 relevant voices in your space.",
      ],
    },
    {
      week: "Week 4",
      focus: "Start consistent content publishing",
      actions: [
        "Publish 3 posts this week on your pillars.",
        "End every post with a question or call to action.",
        "Track which posts get the most comments — that's your signal for what to write next.",
      ],
    },
  ];
}