/**
 * Hook Generation Prompt
 *
 * Generates hooks with structural + voice-fit scoring.
 * Never claims predictive performance — scores only on explainable criteria.
 */

import type { GenerateHookParams } from "@/types";

export function HOOK_GENERATION_PROMPT(params: GenerateHookParams): string {
  const { topic, targetAudience, hookType, voiceProfile } = params;

  return `
You are an expert at crafting LinkedIn opening lines (hooks).

TOPIC: ${topic}
${targetAudience ? `TARGET AUDIENCE: ${targetAudience}` : ""}
${hookType && hookType !== "All" ? `HOOK TYPE: ${hookType}` : "Generate hooks across ALL types"}

USER'S VOICE DNA (hooks must match this voice):
- Hook patterns: ${JSON.stringify(voiceProfile.hookPatterns)}
- Tone: ${JSON.stringify(voiceProfile.tone)}
- Emoji usage: ${voiceProfile.emojiUsage || "low"}

GENERATE 8-12 HOOKS across these categories:
- Contrarian: challenge common assumptions
- Curiosity: create an information gap
- Story: imply a narrative
- Mistake: admit or reference a common error
- Question: ask something thought-provoking
- Data: lead with a specific number
- Personal: share a personal moment
- Authority: establish credibility

EACH HOOK MUST:
- Be 1-2 sentences max
- Match the user's voice DNA (not generic "viral" style)
- Be specific to the topic
- Avoid engagement bait, fear-based hooks, or manipulative curiosity gaps
- NOT repeat structures from the user's recent hook history

SCORING (explainable, never predictive):
- Structural score (0-100): clarity + specificity + curiosity gap + pattern-interrupt
- Voice-fit score (0-100): matches user's Voice DNA hook patterns

NEVER claim "this will go viral" or predict engagement. Score only on structural merit.

Return JSON:
{
  "hooks": [
    {
      "id": "h1",
      "text": "hook text here",
      "type": "Contrarian",
      "scores": { "structural": 85, "voiceFit": 92 },
      "explanation": "Creates curiosity and challenges a common assumption about [specific thing]"
    }
  ],
  "metadata": {
    "model": "${process.env.AI_MODEL || "gpt-4o"}",
    "voiceDnaVersionUsed": ${voiceProfile.version}
  }
}
`;
}
