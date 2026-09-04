/**
 * Rewrite Prompt
 *
 * Rewrites existing content with Voice DNA applied.
 * Supports length, tone, and format modifications.
 */

import type { RewriteParams } from "@/types";

export function REWRITE_PROMPT(params: RewriteParams): string {
  const { content, instructions, voiceProfile } = params;

  return `
You are an expert at rewriting content to match a specific voice.

ORIGINAL CONTENT:
${content}

REWRITE INSTRUCTIONS: ${instructions}

VOICE DNA (apply this voice to the rewrite):
- Tone: ${JSON.stringify(voiceProfile.tone)}
- Sentence style: ${voiceProfile.sentenceStyle || "medium"}
- Paragraph style: ${voiceProfile.paragraphStyle || "medium"}
- Hook patterns: ${JSON.stringify(voiceProfile.hookPatterns)}
- CTA style: ${voiceProfile.ctaStyle || "question"}
- Emoji usage: ${voiceProfile.emojiUsage || "low"}
- Words to avoid: ${JSON.stringify(voiceProfile.wordsToAvoid)}

RULES:
1. Preserve the core message — change HOW it's said, not WHAT is said
2. Apply Voice DNA voice traits to every sentence
3. Never invent new facts, statistics, or personal experiences
4. If the rewrite makes the content longer/shorter, respect that in the output
5. Maintain the original's intent and key points

Return JSON:
{
  "rewritten": "the rewritten content",
  "changes": [
    "Changed hook from generic to contrarian style",
    "Shortened paragraphs to match short paragraph preference",
    "Added question CTA per voice DNA"
  ],
  "metadata": {
    "model": "${process.env.AI_MODEL || "gpt-4o"}",
    "voiceDnaVersionUsed": ${voiceProfile.version}
  }
}
`;
}
