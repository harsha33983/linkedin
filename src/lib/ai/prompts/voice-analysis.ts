/**
 * Voice DNA Analysis Prompt
 *
 * Analyzes writing samples and extracts structured voice dimensions.
 * Returns JSON matching VoiceAnalysisResult type.
 */

export function VOICE_ANALYSIS_PROMPT(
  samples: string[],
  sourceWeighting: Record<string, number>
): string {
  return `
You are an expert at analyzing writing styles. Given the following writing samples, extract a structured "Voice DNA" — the unique fingerprint of how this person writes.

WRITING SAMPLES:
${samples.map((s, i) => `\n--- Sample ${i + 1} ---\n${s}\n`).join("\n")}

SOURCE WEIGHTING: ${JSON.stringify(sourceWeighting)}
(Higher weight = more representative of the target LinkedIn voice)

Analyze across these dimensions and return a JSON object:

{
  "tone": ["conversational", "direct", "educational"], // 2-4 traits
  "sentenceStyle": "short" | "short-medium" | "medium" | "long",
  "paragraphStyle": "short" | "medium" | "long",
  "hookPatterns": ["contrarian", "story", "question", "data", "personal", "authority", "curiosity", "mistake"], // 1-3 patterns
  "ctaStyle": "question" | "statement" | "soft-cta" | "none",
  "emojiUsage": "none" | "low" | "moderate" | "high",
  "commonTopics": ["AI", "startups"], // topics that appear frequently
  "wordsToAvoid": [], // words/phrases that feel inauthentic for this voice
  "writingPatterns": {
    "usesLists": true/false,
    "usesLineBreaks": true/false,
    "avgSentenceLength": "short" | "medium" | "long",
    "personalStories": true/false,
    "asksQuestions": true/false,
    "usesAnalogies": true/false
  },
  "consistencyScore": 0.85 // 0-1: how consistent the voice is across samples
}

RULES:
1. Be specific to THIS writer — not a generic "good LinkedIn post"
2. If samples conflict, note the dominant pattern
3. confidenceScore will be computed separately from sample count + this consistencyScore
4. Preserve distinctive choices (e.g., if they NEVER use emojis, say "none" — don't default to "low")
5. Words to avoid should be phrases that feel generic/AI-ish when applied to THIS specific voice
`;
}
