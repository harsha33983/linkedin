/**
 * Content Ideas Generation Prompt
 *
 * Generates personalized LinkedIn content ideas from the user's REAL profile
 * and activity — not generic topics. Signals include:
 *
 * - User profile: expertise, audience, goals, occupation
 * - Voice DNA: how the user writes
 * - Activity profile: what they actually posted, how often, in which formats,
 *   which hooks, and (when measurable) what got the most engagement
 * - Performance / Audience / Trend DNA summaries
 * - Already-covered topics + active/dismissed ideas (anti-repetition)
 *
 * The generator leans into what the data says works for THIS user, fills
 * genuine content gaps, and never recommends a topic they just covered.
 */

import type { GenerateIdeaParams } from "@/types";

export function IDEA_GENERATION_PROMPT(params: GenerateIdeaParams): string {
  const {
    expertise,
    targetAudience,
    goals,
    voiceProfile,
    previousContent,
    rejectionHistory,
    activityProfile,
    activeIdeas,
    performanceSummary,
    audienceSummary,
    trendSummary,
  } = params;

  const voiceCommonTopics =
    (Array.isArray(voiceProfile.commonTopics) && voiceProfile.commonTopics.length > 0
      ? voiceProfile.commonTopics
      : voiceProfile.metadata && Array.isArray((voiceProfile.metadata as any).expertise)
      ? (voiceProfile.metadata as any).expertise
      : []
    ).slice(0, 8);

  const coveredTopics = Array.from(
    new Set([
      ...(activityProfile?.topTopics || []).map((t) => t.topic),
      ...(activityProfile?.recentTopics || []),
    ])
  ).slice(0, 20);

  const gaps = (expertise || [])
    .filter(
      (e) =>
        !coveredTopics.some((c) => c.toLowerCase().includes(e.toLowerCase()))
    )
    .slice(0, 4);

  const fmtList = (rows: Array<{ topic?: string; hook?: string; format?: string; posts?: number; avgEngagement?: number; bestEngagement?: number }>, labelKey: "topic" | "hook" | "format") =>
    (rows || [])
      .slice(0, 5)
      .map(
        (r, i) =>
          `${i + 1}. ${r[labelKey]} — ${r.posts} post${(r.posts || 0) === 1 ? "" : "s"}${
            (r.avgEngagement ?? 0) > 0
              ? `, avg engagement ${(r.avgEngagement! * 100).toFixed(1)}%`
              : ", engagement not yet measurable"
          }`
      )
      .join("\n");

  const activitySection = activityProfile
    ? `
REAL ACTIVITY (from their actual published posts):
- Total published: ${activityProfile.publishedCount}
- Measurable engagement samples: ${activityProfile.sampleSize}
- Average engagement rate: ${(activityProfile.avgEngagementRate * 100).toFixed(1)}%

TOP TOPICS (most posted / best performing):
${fmtList(activityProfile.topTopics, "topic") || "Not enough data"}

TOP FORMATS (formats they actually use and how they perform):
${fmtList(activityProfile.topFormats, "format") || "Not enough data"}

TOP HOOKS (openings that work for them):
${fmtList(activityProfile.topHooks, "hook") || "Not enough data"}

BEST PERFORMING POSTS (the bar to aim for):
${(activityProfile.bestPerformingPosts || [])
  .slice(0, 5)
  .map(
    (p, i) =>
      `${i + 1}. Topic: ${p.topic || "untagged"} | Format: ${p.format || "Text"} | Hook: ${p.hook} | Engagement: ${(p.engagementRate * 100).toFixed(1)}%`
  )
  .join("\n")}

RECENT TOPICS THEY JUST COVERED (do NOT suggest these again):
${(activityProfile.recentTopics || []).slice(0, 8).join(", ") || "None yet"}

RECENT HOOKS (avoid repeating these openings):
${(activityProfile.recentHooks || []).slice(0, 5).map((h) => `- "${h}"`).join("\n") || "None yet"}
`
    : "No published activity yet — treat every idea as a fresh start.";

  return `
You are the content strategist for a specific LinkedIn creator. Your ONLY job is to generate ideas that fit THIS person's profile and REAL activity data. Never generate generic, copy-paste LinkedIn advice.

=== WHO THE USER IS ===
Expertise: ${JSON.stringify(expertise || [])}
Occupation: ${JSON.stringify((voiceProfile.metadata as any)?.occupation || null)}
Target audience: ${JSON.stringify(targetAudience || [])}
Goals: ${JSON.stringify(goals || [])}

=== HOW THE USER WRITES (VOICE DNA) ===
- Tone: ${JSON.stringify(voiceProfile.tone || [])}
- Sentence style: ${voiceProfile.sentenceStyle || "medium"} | Paragraph style: ${voiceProfile.paragraphStyle || "medium"}
- Hook patterns: ${JSON.stringify(voiceProfile.hookPatterns || [])}
- CTA style: ${voiceProfile.ctaStyle || "none"}
- Emoji usage: ${voiceProfile.emojiUsage || "low"}
- Common topics: ${JSON.stringify(voiceCommonTopics || [])}
- Words to avoid: ${JSON.stringify(voiceProfile.wordsToAvoid || [])}

=== WHAT THE USER HAS ACTUALLY DONE ===
${activitySection}

${performanceSummary ? `=== PERFORMANCE DNA ===\n${performanceSummary}` : ""}
${audienceSummary ? `=== AUDIENCE DNA ===\n${audienceSummary}` : ""}
${trendSummary ? `=== TREND DNA (timely topics) ===\n${trendSummary}` : ""}

${previousContent?.length ? `PREVIOUS CONTENT TITLES (avoid repetition):\n${previousContent.map((c, i) => `${i + 1}. ${c}`).join("\n")}` : ""}
${activeIdeas?.length ? `IDEAS ALREADY IN THEIR LIBRARY (do NOT resurface these):\n${activeIdeas.join("\n")}` : ""}
${rejectionHistory?.length ? `IDEAS THEY DISMISSED (patterns to avoid):\n${rejectionHistory.join("\n")}` : ""}

=== GENERATION LOGIC ===
1. WEIGHT real activity heavily: if the activity data shows clear patterns, anchor ideas in the topics, formats, and hooks that already work for this user — expand them with NEW angles. Do not suggest what they just posted.
2. Surface CONTENT GAPS: expertise areas they have NEVER posted about${gaps.length ? ` — currently: ${gaps.join(", ")}` : " (none detected)"}.
3. Blend in 1-3 timely ideas when the Trend DNA supplies relevant signals (relevance + strength).
4. Match every idea to the user's voice (tone, format, hook style above). No corporate filler, no buzzword soup.
5. Each idea must be specific enough that the user could write it today from their own experience — and must be grounded in the data above, never fabricated.

GENERATE 10-15 IDEAS covering: personal stories, educational, contrarian (if their DNA supports it), content gaps, repurpose/new-angle opportunities, and trend-tied ideas.

RULES:
- Do NOT repeat recent topics, existing library ideas, or dismissed patterns.
- Never invent topics outside their expertise unless a strong trend signal justifies it.
- Every idea explains WHY it fits THIS user (cite the activity/DNA signal that drove it).
- Keep it authentic to their voice — nothing generic.

Return JSON:
{
  "ideas": [
    {
      "title": "Specific, clickable title",
      "description": "1-2 sentence description of the post",
      "topic": "specific topic",
      "format": "Educational",
      "category": "Personal stories | Educational | Contrarian | Content gaps | Repurpose opportunities | Trend",
      "suggestionReason": "Short explanation citing their activity (e.g., 'Your X posts drive your highest engagement; this is a fresh angle' or 'You listed X as expertise but have never posted about it')"
    }
  ],
  "metadata": { "model": "${process.env.AI_MODEL || "gpt-4o"}" }
}
`;
}
