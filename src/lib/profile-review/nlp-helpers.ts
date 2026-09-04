/**
 * Profile input normalization (analysis shape)
 */

import type { NormalizedProfile } from "./nlp";

export function normalizeProfile(
  input: Partial<Omit<NormalizedProfile, "skills">> & { skills?: string[] | string }
): NormalizedProfile {
  return {
    headline: (input.headline || "").trim(),
    about: (input.about || "").trim(),
    experience: (input.experience || "").trim(),
    skills: Array.isArray(input.skills)
      ? input.skills.map((s) => String(s).trim()).filter(Boolean)
      : String(input.skills || "")
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
    education: (input.education || "").trim(),
  };
}