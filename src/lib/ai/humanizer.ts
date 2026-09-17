/**
 * Human Writing Engine — composes the "humanizer" constraint block.
 *
 * Never a generic "make this sound human" prompt. This assembles concrete,
 * structured instructions from measurable inputs:
 *   - the chosen post structure (LLM fills, never invents architecture)
 *   - user-provided FACTS (what happened / learned / result) — highest priority
 *   - the user's Voice DNA / NLP style profile
 *   - learned style adjustments from past edits (edit-learning)
 *   - retrieved style examples (RAG) as reference-only context
 *   - an explicit banned-pattern list (the deterministic detector's targets)
 */

import { formatStructureForPrompt, StructureDef } from "./post-structure";

export interface UserFacts {
  whatHappened?: string;
  whatLearned?: string;
  result?: string;
}

export interface HumanizerInput {
  structure: StructureDef;
  facts: UserFacts;
  nlpProfile?: any | null;
  learnedAdjustments?: string;   // pre-formatted block from edit-learning
  examplesBlock?: string;        // pre-formatted block from style-examples
  targetAudience?: string;
  tone?: string;
  length?: "short" | "medium" | "long";
}

const LENGTH_GUIDE: Record<string, string> = {
  short: "40-90 words. Ruthlessly concise.",
  medium: "90-180 words.",
  long: "180-280 words. Still tighter than feels natural — cut twice.",
};

export function buildHumanizerBlock(input: HumanizerInput): string {
  const { structure, facts, nlpProfile, learnedAdjustments = "", examplesBlock = "" } = input;

  // Style facts from the NLP profile (only when real data exists)
  const styleLines: string[] = [];
  if (nlpProfile?.consistency?.sampleSize > 0) {
    const s = nlpProfile;
    styleLines.push(`- Sentence rhythm: avg ${s.sentenceStructure.avgSentenceLength} words; ${s.sentenceStructure.shortSentences}% short sentences; fragments ${s.sentenceStructure.fragmentUsage}%`);
    styleLines.push(`- Paragraphs: ${s.paragraphStructure.formattingStyle} formatting; ${s.paragraphStructure.singleSentenceParagraphs}% single-sentence paragraphs`);
    styleLines.push(`- Punctuation: periods ${s.punctuation.periodStyle}; exclamations ${s.punctuation.exclamationStyle}; em-dashes ${s.punctuation.dashUsage > 0.3 ? "yes" : "rare"}`);
    styleLines.push(`- Vocabulary: ${s.vocabulary.technicalLevel}; emoji frequency ${(s.formatting.emojiFrequency * 100).toFixed(0)}%`);
    styleLines.push(`- Archetype: "${s.tone.voiceArchetype}"; directness ${Math.round(s.tone.directnessScore * 100)}%`);
  }

  return `
==================================================
HUMAN WRITING RULES (hard constraints — violation = rejected draft)
==================================================

VOICE:
- Write like a real person explaining something they actually experienced or believe.
- ${styleLines.length ? "Match the user's measured style:\n" + styleLines.join("\n") : "Use plain, direct language. Short paragraphs. Natural rhythm."}
- Preserve the user's vocabulary level. Do not sound more corporate than the user.
- Vary sentence length naturally. Occasional fragments are fine when they fit.

BANNED PATTERNS (any of these = automatic quality failure):
- Openers: "In today's fast-paced world", "I'm excited to share", "Let's dive in", "Stop scrolling", "Here's the thing", "We've all been there", "Day X of…"
- Buzzwords: "game changer", "synergy", "leverage", "unlock the power", "unleash", "revolutionize", "cutting-edge", "supercharge", "elevate your", "paradigm shift", "move the needle"
- Closers: "The possibilities are endless", "What are you waiting for?", "The choice is yours", "Let's shape the future"
- Formatting: NO markdown bold (LinkedIn renders it literally). No emoji walls. No hashtag spam (3-5 max at most).
- Claims: unsourced "studies show", invented percentages, invented personal experiences, invented metrics.

FACTS & FABRICATION:
- Use ONLY the facts the user provided. If a fact is missing, write around it — never invent.
- Do not fabricate experiences, numbers, results, or emotions.
- Do not exaggerate. Understatement reads more human than hype.

STRUCTURE:
${formatStructureForPrompt(input.structure, facts)}

${learnedAdjustments}

${examplesBlock}

TARGET: ${LENGTH_GUIDE[input.length || "medium"]}${input.tone ? ` Tone: ${input.tone}.` : ""}${input.targetAudience ? ` Audience: ${input.targetAudience}.` : ""}
`;
}
