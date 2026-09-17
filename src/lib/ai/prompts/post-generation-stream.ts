import type { GeneratePostParams } from "@/types";

/**
 * Streaming post-generation prompt.
 *
 * JSON output cannot be parsed while it streams, so the streaming path uses a
 * strict line protocol instead:
 *
 *   META: {"label":"...","format":"...","hook":"...","scores":{"overall":0,"voiceFit":0},"imageQuery":"..."}
 *   <post content, LinkedIn line breaks>
 *   ===VERSION===
 *   META: {...}
 *   ...
 *
 * This lets the server forward content deltas to the browser the moment they
 * arrive (token-by-token / line-by-line rendering) instead of waiting for the
 * whole response.
 */
export function POST_GENERATION_STREAM_PROMPT(
  params: GeneratePostParams & {
    recentPosts?: any[];
    trendingTopics?: any[];
    contentPillars?: string[];
    styleContext?: { humanizerBlock: string; structureId: string } | null;
  }
): string {
  const base = POST_GENERATION_STREAM_RULES(params);
  return `${base}

OUTPUT FORMAT (STRICT — follow exactly, no markdown fences, no extra prose):

META: {"label":"Recommended","format":"Educational","hook":"first line of the post","scores":{"overall":0,"voiceFit":0},"imageQuery":"3-5 word image search phrase"}
<the full post text for version 1, using \\n\\n line breaks exactly as it should appear on LinkedIn>
===VERSION===
META: {"label":"Different angle","format":"Contrarian","hook":"...","scores":{"overall":0,"voiceFit":0},"imageQuery":"..."}
<the full post text for version 2>
===VERSION===
META: {"label":"Alternative format","format":"Personal story","hook":"...","scores":{"overall":0,"voiceFit":0},"imageQuery":"..."}
<the full post text for version 3>

RULES:
- Exactly 3 versions, separated by a line containing only ===VERSION===
- Each version starts with a single META: line containing VALID JSON (no trailing commas)
- The META "hook" MUST equal the post's first line
- No text before the first META: line and nothing after the last version's content
- Overall and voiceFit scores are integers 0-100 — your honest self-assessment
- imageQuery: a short Unsplash-style search phrase (e.g. "developer workspace late night")
`;
}

function POST_GENERATION_STREAM_RULES(params: GeneratePostParams): string {
  const {
    topic,
    goal,
    format,
    tone,
    length,
    targetAudience,
    voiceProfile,
    userProfile,
    recentPosts,
    trendingTopics,
    contentPillars,
    dnaProfile,
  } = params as any;

  const recentPostsSummary = (recentPosts || [])
    .slice(0, 10)
    .map((p: any) => {
      const metrics = p.hasRealMetrics
        ? ` (${p.impressions ?? 0} impressions, ${(p.engagementRate ?? 0) * 100}% engagement)`
        : " (no measured metrics yet)";
      return `- [${p.format || "unknown"}] ${(p.content || "").slice(0, 140).replace(/\n/g, " ")}${metrics}`;
    })
    .join("\n");

  const trendsSummary = (trendingTopics || [])
    .slice(0, 6)
    .map((t: any) => `- ${t.topic} (strength ${t.trendStrength ?? "?"}): ${t.relevance ?? ""}`)
    .join("\n");

  const { styleContext } = params as any;
  return `You are the AI Growth Engine for a LinkedIn content SaaS. Generate 3 DISTINCT versions of a LinkedIn post.

TOPIC: ${topic}
GOAL: ${goal || "Grow influence and engagement"}
FORMAT: ${format || "Best match for the user's Voice DNA"}
TONE: ${tone || "User's authentic Voice DNA voice"}
LENGTH: ${length || "medium"} (short: 1-2 paragraphs, medium: 3-5, long: 6+)
TARGET AUDIENCE: ${targetAudience || userProfile?.targetAudience || "the user's professional network"}

VOICE DNA (hard constraints — the post must sound like this person):
${JSON.stringify(
  {
    tone: voiceProfile?.tone,
    sentenceStyle: voiceProfile?.sentenceStyle,
    paragraphStyle: voiceProfile?.paragraphStyle,
    hookPatterns: voiceProfile?.hookPatterns,
    ctaStyle: voiceProfile?.ctaStyle,
    emojiUsage: voiceProfile?.emojiUsage,
    commonTopics: voiceProfile?.commonTopics,
    wordsToAvoid: voiceProfile?.wordsToAvoid,
    voiceArchetype: voiceProfile?.writingPatterns?.voiceArchetype,
  },
  null,
  1
)}

USER CONTEXT: ${JSON.stringify(
  {
    name: userProfile?.name,
    expertise: userProfile?.expertise,
    occupation: userProfile?.occupation,
    targetAudience: userProfile?.targetAudience,
    goals: userProfile?.linkedinGoals,
  },
  null,
  1
)}

CONTENT PILLARS: ${JSON.stringify(contentPillars || [])}

PERFORMANCE DNA (what already works for THIS user):
${dnaProfile?.performance?.summary || "No measured performance data yet — say so honestly, never invent numbers."}

AUDIENCE DNA: ${dnaProfile?.audience?.summary || "Not yet measurable."}
TREND DNA: ${dnaProfile?.trend?.summary || "No trend data."}

THE USER'S RECENT POSTS (match voice, do NOT repeat hooks or angles):
${recentPostsSummary || "None yet."}

TRENDING TOPICS:
${trendsSummary || "None."}

WRITING RULES:
- Sound like the user's Voice DNA, not a generic LinkedIn voice
- Hook = the first line; make it stop the scroll
- LinkedIn-style formatting with \\n\\n between paragraphs
- No fabricated statistics, metrics, or personal experiences
- Never use: "In today's fast-paced world", "Let's dive in", "Here's the thing", "Stop scrolling", "I'm going to share"
- Each version must take a distinctly different angle, not a rewording
- If Voice DNA confidence is low, keep the post simple and universal${
  styleContext?.humanizerBlock
    ? `

${styleContext.humanizerBlock}`
    : ""
}`;
}
