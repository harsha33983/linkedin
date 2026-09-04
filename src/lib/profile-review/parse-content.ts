/**
 * Profile Content Parser
 *
 * Parses free-form pasted profile text into sections.
 * Marker-based ("Headline:", "About:", "Experience:", "Skills:", "Education:");
 * falls back to treating everything as About content.
 */

import type { NormalizedProfile } from "./nlp";

const SECTION_MARKERS: { key: keyof NormalizedProfile; patterns: RegExp[] }[] = [
  { key: "headline", patterns: [/^headline\s*:/i, /^headline$/i, /^title\s*:/i] },
  { key: "about", patterns: [/^about(?:\s+me)?\s*:/i, /^about\s*$/i, /^summary\s*:/i, /^summary\s*$/i] },
  { key: "experience", patterns: [/^experience\s*:/i, /^experience\s*$/i, /^work experience\s*:/i, /^work\s*:/i] },
  { key: "skills", patterns: [/^skills\s*:/i, /^skills\s*$/i, /^top skills\s*:/i] },
  { key: "education", patterns: [/^education\s*:/i, /^education\s*$/i] },
];

export function parseProfileContent(raw: string): Partial<NormalizedProfile> {
  const text = raw.replace(/\r/g, "").trim();
  const lines = text.split("\n");

  // Marker-based parsing
  const sections: Partial<NormalizedProfile> = {};
  let currentKey: keyof NormalizedProfile | null = null;
  const buffers: Partial<Record<keyof NormalizedProfile, string[]>> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    let matched: keyof NormalizedProfile | null = null;
    let inlineContent: string | null = null;
    for (const marker of SECTION_MARKERS) {
      if (marker.patterns.some((p) => p.test(trimmed))) {
        matched = marker.key;
        // Content on the marker line itself, e.g. "Headline: Staff Engineer"
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx >= 0) {
          const rest = trimmed.slice(colonIdx + 1).trim();
          if (rest) inlineContent = rest;
        }
        break;
      }
    }
    if (matched) {
      currentKey = matched;
      buffers[currentKey] = buffers[currentKey] || [];
      if (inlineContent) buffers[currentKey]!.push(inlineContent);
      continue;
    }
    if (currentKey && trimmed) {
      buffers[currentKey]!.push(trimmed);
    }
  }

  const filled = Object.entries(buffers).filter(([, v]) => v && v.length > 0);
  if (filled.length >= 2) {
    for (const [key] of filled) {
      const linesArr = buffers[key as keyof NormalizedProfile] || [];
      const joined = linesArr.join("\n");
      if (key === "skills") {
        sections.skills = joined.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      } else {
        (sections as Record<string, unknown>)[key] = joined;
      }
    }
    return sections;
  }

  // Fallback: heuristic split
  const firstLine = lines.find((l) => l.trim());
  const firstLineWords = (firstLine || "").trim().split(/\s+/).length;
  if (firstLine && firstLineWords <= 15) {
    sections.headline = firstLine.trim();
  }
  sections.about = lines.join("\n").trim();
  return sections;
}