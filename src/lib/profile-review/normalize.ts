/**
 * Profile Normalization
 *
 * Converts NormalizedProfileData (from any provider) into the analysis
 * input consumed by the NLP engine. Original text is preserved — only
 * trimmed and deduped; nothing is rewritten.
 */

import type { NormalizedProfileData } from "./types";
import type { NormalizedProfile } from "./nlp";

export function profileToAnalysisInput(data: NormalizedProfileData): NormalizedProfile {
  const experienceText = data.experience
    .map((e) => {
      const parts: string[] = [];
      const header: string[] = [];
      if (e.role) header.push(e.role);
      if (e.company) header.push(`at ${e.company}`);
      if (e.duration || e.startDate) header.push(`(${e.duration || e.startDate}${e.endDate ? ` - ${e.endDate}` : ""})`);
      if (header.length) parts.push(header.join(" "));
      if (e.bullets.length) parts.push(...e.bullets.map((b) => `- ${b}`));
      else if (e.description) parts.push(...e.description.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => `- ${l}`));
      return parts.join("\n");
    })
    .filter((t) => t.trim())
    .join("\n\n");

  const educationText = data.education
    .map((e) => [e.school, e.degree, e.field].filter(Boolean).join(" — "))
    .filter((t) => t.trim())
    .join("\n");

  return {
    headline: data.headline || "",
    about: data.about || "",
    experience: experienceText,
    skills: data.skills,
    education: educationText,
  };
}

/** Human-readable summary of the retrieved profile (used in the report header). */
export function profileIdentitySummary(data: NormalizedProfileData): {
  name: string | null;
  headline: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  location: string | null;
} {
  return {
    name: data.name,
    headline: data.headline,
    currentRole: data.currentPosition?.role || data.experience[0]?.role || null,
    currentCompany: data.currentPosition?.company || data.experience[0]?.company || null,
    location: data.location,
  };
}