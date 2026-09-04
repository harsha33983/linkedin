/**
 * Post Quality Check Prompt
 *
 * Quality gate that runs BEFORE output reaches the user.
 * Fail-closed: if a check fails, regenerate server-side.
 *
 * Checks for:
 * (a) Fabricated statistics/claims
 * (b) Invented personal anecdotes
 * (c) Hook repetition against user's last 10 generated hooks
 */

import type { VoiceProfile } from "@/types";

export function QUALITY_CHECK_PROMPT(
  content: string,
  voiceProfile: VoiceProfile,
  recentHooks: string[]
): string {
  return `
You are a content quality reviewer. Analyze this LinkedIn post for THREE specific issues:

POST TO CHECK:
${content}

VOICE DNA CONTEXT:
- Tone: ${JSON.stringify(voiceProfile.tone)}
- Common topics: ${JSON.stringify(voiceProfile.commonTopics)}

USER'S RECENT HOOKS (last 10 — check for repetition):
${recentHooks.length ? recentHooks.map((h, i) => `${i + 1}. "${h}"`).join("\n") : "No recent hooks yet."}

CHECK 1 — FABRICATED STATISTICS/CLAIMS:
Does the post contain specific numbers, percentages, or statistics that were NOT provided by the user?
Does it present unsupported claims as fact?
Flag any "research shows..." or "studies say..." without citation.

CHECK 2 — INVENTED ANECDOTES:
Does the post invent personal experiences, stories, or case studies?
Does it use phrases like "I once..." or "A friend of mine..." that could be fabricated?
Note: The AI should never invent personal experiences — only use what the user provided.

CHECK 3 — HOOK REPETITION:
Does the opening line match or closely resemble any of the user's recent hooks?
Check for: same structure, same pattern, same word choices, same rhetorical device.
A hook that uses the exact same pattern as a recent hook is a repetition.

RULES:
- Be strict — it's better to flag a false positive than miss a real issue
- If ALL checks pass, set passes: true
- If ANY check fails, set passes: false with specific details

Return JSON:
{
  "passes": true/false,
  "fabricatedClaims": true/false,
  "inventedAnecdotes": true/false,
  "hookRepetition": true/false,
  "details": [
    "Check 1: No fabricated statistics found",
    "Check 2: No invented anecdotes found",
    "Check 3: Hook uses similar structure to recent hook #3"
  ]
}
`;
}
