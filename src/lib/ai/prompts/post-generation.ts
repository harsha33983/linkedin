/**
 * AI Growth Engine — Post Generation Prompt
 *
 * Generates LinkedIn posts using the full AI Growth Engine pipeline:
 * 1. Analyze performance patterns from historical data
 * 2. Find content opportunities at the intersection of trends, voice, and performance
 * 3. Select the best opportunity and generate hooks
 * 4. Write the final post in the user's exact Voice DNA
 *
 * Voice DNA is a HARD CONSTRAINT — not a suggestion.
 */

import type { GeneratePostParams } from "@/types";
import { formatDNAForPrompt } from "@/lib/dna";

interface PerformanceDataPoint {
  content: string;
  impressions?: number;
  likes?: number;
  comments?: number;
  reposts?: number;
  saves?: number;
  engagementRate?: number;
  format?: string;
  topic?: string;
  hookType?: string;
  publishedAt?: string;
}

interface TrendingTopic {
  topic: string;
  relevance: string;
  trendStrength: number;
}

export function POST_GENERATION_PROMPT(
  params: GeneratePostParams & {
    recentPosts?: PerformanceDataPoint[];
    trendingTopics?: TrendingTopic[];
    contentPillars?: string[];
  }
): string {
  const {
    topic,
    goal,
    format,
    tone,
    length,
    targetAudience,
    voiceProfile,
    userProfile,
    recentPosts = [],
    trendingTopics = [],
    contentPillars = [],
  } = params;

  // Build Voice DNA description
  const toneStr =
    typeof voiceProfile.tone === "object" && voiceProfile.tone !== null
      ? (voiceProfile.tone as any)?.primary
        ? `${(voiceProfile.tone as any).primary}${
            (voiceProfile.tone as any).secondary
              ? ", " + (voiceProfile.tone as any).secondary
              : ""
          }`
        : JSON.stringify(voiceProfile.tone)
      : String(voiceProfile.tone || "professional");

  const hookPatternsStr =
    typeof voiceProfile.hookPatterns === "object" &&
    voiceProfile.hookPatterns !== null
      ? (voiceProfile.hookPatterns as any)?.templates
        ? (voiceProfile.hookPatterns as any).templates.join(", ")
        : JSON.stringify(voiceProfile.hookPatterns)
      : String(voiceProfile.hookPatterns || "strong opinion");

  const commonTopicsStr =
    typeof voiceProfile.commonTopics === "object" &&
    voiceProfile.commonTopics !== null
      ? (voiceProfile.commonTopics as any)?.topics
        ? (voiceProfile.commonTopics as any).topics.join(", ")
        : JSON.stringify(voiceProfile.commonTopics)
      : String(voiceProfile.commonTopics || "technology");

  const wordsToAvoidStr = Array.isArray(voiceProfile.wordsToAvoid)
    ? voiceProfile.wordsToAvoid.join(", ")
    : "utilize, synergy, leverage";

  const voiceDnaDescription = `
VOICE DNA (HARD CONSTRAINT — output MUST sound like this person):
- Tone: ${toneStr}
- Sentence style: ${voiceProfile.sentenceStyle || "medium"}
- Paragraph style: ${voiceProfile.paragraphStyle || "short_blocks"}
- Hook patterns: ${hookPatternsStr}
- CTA style: ${voiceProfile.ctaStyle || "question_based"}
- Emoji usage: ${voiceProfile.emojiUsage || "minimal"}
- Common topics: ${commonTopicsStr}
- Words to avoid: ${wordsToAvoidStr}
- Writing patterns: ${JSON.stringify(voiceProfile.writingPatterns || {})}
- Confidence score: ${voiceProfile.confidenceScore} (lower = more generic fallback needed)
`;

  // Build performance data description
  let performanceAnalysis = "";
  if (recentPosts.length > 0) {
    const postsWithMetrics = recentPosts.filter(
      (p) => p.impressions && p.impressions > 0
    );

    if (postsWithMetrics.length >= 3) {
      // Calculate engagement rates
      const postsWithEngagement = postsWithMetrics
        .map((p) => ({
          ...p,
          calcEngagement:
            p.engagementRate ||
            ((p.likes || 0) +
              (p.comments || 0) +
              (p.reposts || 0) +
              (p.saves || 0)) /
              (p.impressions || 1),
        }))
        .sort((a, b) => b.calcEngagement - a.calcEngagement);

      const topPosts = postsWithEngagement.slice(
        0,
        Math.ceil(postsWithEngagement.length * 0.25)
      );
      const avgEngagement =
        postsWithEngagement.reduce(
          (sum, p) => sum + p.calcEngagement,
          0
        ) / postsWithEngagement.length;

      // Find patterns in top posts
      const topTopics = topPosts
        .map((p) => p.topic)
        .filter(Boolean)
        .reduce(
          (acc, t) => {
            acc[t!] = (acc[t!] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

      const topFormats = topPosts
        .map((p) => p.format)
        .filter(Boolean)
        .reduce(
          (acc, f) => {
            acc[f!] = (acc[f!] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

      const topHookTypes = topPosts
        .map((p) => p.hookType)
        .filter(Boolean)
        .reduce(
          (acc, h) => {
            acc[h!] = (acc[h!] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

      performanceAnalysis = `
PERFORMANCE ANALYSIS (from ${postsWithMetrics.length} posts with metrics):

Top performing topics (by engagement rate): ${Object.entries(topTopics).sort(([, a], [, b]) => (b as number) - (a as number)).map(([topic, count]) => `${topic} (${count}x in top 25%)`).join(", ") || "Insufficient data"}

Top performing formats: ${Object.entries(topFormats).sort(([, a], [, b]) => (b as number) - (a as number)).map(([fmt, count]) => `${fmt} (${count}x)`).join(", ") || "Insufficient data"}

Top performing hook types: ${Object.entries(topHookTypes).sort(([, a], [, b]) => (b as number) - (a as number)).map(([hook, count]) => `${hook} (${count}x)`).join(", ") || "Insufficient data"}

Average engagement rate: ${(avgEngagement * 100).toFixed(1)}%
Top 25% engagement rate: ${postsWithEngagement.length > 0 ? (postsWithEngagement[0].calcEngagement * 100).toFixed(1) : "N/A"}%

Recent posts for anti-repetition (DO NOT repeat these hooks or angles):
${recentPosts
  .slice(0, 5)
  .map((p) => `- "${(p.content || "").substring(0, 80)}..."`)
  .join("\n")}
`;
    } else {
      performanceAnalysis = `
PERFORMANCE DATA: ${recentPosts.length} posts available, but ${postsWithMetrics.length} have metrics. Using topic diversity from available posts.
Recent posts for anti-repetition:
${recentPosts
  .slice(0, 5)
  .map((p) => `- "${(p.content || "").substring(0, 80)}..."`)
  .join("\n")}
`;
    }
  } else {
    performanceAnalysis = `
PERFORMANCE DATA: No historical post data available. Confidence is LOW — generating based on Voice DNA and topic input only.
`;
  }

  // Build trending topics description
  let trendingAnalysis = "";
  if (trendingTopics.length > 0) {
    trendingAnalysis = `
TRENDING TOPICS:
${trendingTopics.map((t) => `- ${t.topic} (relevance: ${t.relevance}, strength: ${t.trendStrength}/10)`).join("\n")}

Use trends as a STARTING POINT, not the entire post. Connect the trend to the user's expertise, opinion, and audience. Provide an original perspective — do not write generic trend commentary.
`;
  }

  // Content pillars
  const pillarsStr =
    contentPillars.length > 0
      ? `\nCONTENT PILLARS: ${contentPillars.join(", ")}\n`
      : "";

  return `
You are the AI Growth Engine for a LinkedIn content SaaS. Your job is to create the post that has the strongest evidence-based fit for THIS USER's audience while remaining authentic to THEIR voice.

==================================================
VOICE DNA RULE
==================================================
Voice DNA has higher priority than generic LinkedIn writing conventions.

If the user normally writes short sentences with strong opinions and occasional one-line paragraphs, then write that way. Do NOT transform their writing into polished corporate content. Authenticity > grammatical perfection.

==================================================
IMPORTANT PRINCIPLES
==================================================
- DO NOT optimize for generic viral content
- Optimize for: USER-SPECIFIC PERFORMANCE + USER VOICE + RELEVANT TRENDS + AUDIENCE INTEREST + AUTHENTICITY
- A topic being globally viral does NOT mean it is appropriate for the user
- A smaller topic that historically performs well should sometimes be preferred over a massive trend
- Use trends as a starting point, NOT as the entire post
- Never invent personal experiences, numbers, or anecdotes not provided
- Never fabricate statistics or present unsupported claims as fact
- Never use obvious AI phrases like "In today's fast-paced world" or "Let's dive in"
- Never use excessive emojis or unnecessary hashtags

==================================================
INPUTS
==================================================

TOPIC: ${topic}
${goal ? `GOAL: ${goal}` : ""}
${format ? `FORMAT: ${format}` : "FORMAT: Best match for Voice DNA and performance patterns"}
${tone ? `TONE OVERRIDE: ${tone}` : "TONE: Use Voice DNA tone"}
${length ? `LENGTH: ${length}` : "LENGTH: medium (3-5 paragraphs)"}
${targetAudience ? `TARGET AUDIENCE: ${targetAudience}` : ""}
${userProfile.targetAudience?.length ? `USER'S AUDIENCE: ${JSON.stringify(userProfile.targetAudience)}` : ""}
${pillarsStr}
${voiceDnaDescription}
${performanceAnalysis}
${trendingAnalysis}
${params.dnaProfile ? `\nFULL DNA PROFILE (Voice × Performance × Audience × Trends):\n${formatDNAForPrompt(params.dnaProfile)}` : ""}

==================================================
STEP 1 — ANALYZE
==================================================
Using the performance data above, identify:
- Top performing topics, formats, hooks, and structures
- What historically works best for THIS user
- Anti-repetition constraints from recent posts

==================================================
STEP 2 — FIND CONTENT OPPORTUNITY
==================================================
Combine: Historical Performance + Trending Topics + Voice DNA + Audience + Content Pillars

Find the intersection. Think:
"What is happening RIGHT NOW that this specific creator has credibility to talk about?"

Prefer topics where:
1. User has historical performance data showing strong engagement
2. User's Voice DNA aligns naturally
3. There is a timely or trending angle
4. The user's audience cares about this topic

==================================================
STEP 3 — SELECT BEST IDEA
==================================================
Weight approximately:
- Historical topic performance: 25%
- Audience relevance: 20%
- Voice compatibility: 20%
- Trend relevance: 15%
- Hook potential: 10%
- Originality: 10%

==================================================
STEP 4 — GENERATE HOOKS
==================================================
Generate 5 different hooks. Each must use a proven hook pattern from the user's historical performance where possible.

DO NOT copy previous hooks. Learn patterns without reproducing them.

Generate:
1. Strong opinion
2. Curiosity
3. Contrarian
4. Story-based
5. Direct statement

Choose the strongest hook for the final post.

==================================================
STEP 5 — WRITE THE POST
==================================================
Write ONE final LinkedIn post.

The post must:
- Sound like the user
- Match their Voice DNA exactly
- Use their natural vocabulary
- Preserve their personality
- Match their typical sentence rhythm
- Match their formatting habits
- Provide an original perspective
- Not be generic
- Not be repetitive with recent posts
- Not fabricate facts or experiences

Anti-repetition check before finalizing:
- Compare against recent posts above
- Do NOT repeat same hook, same opening sentence, same topic angle, same story, same CTA, same structure

==================================================
GENERATE 3 VERSIONS
==================================================
1. "Recommended" — best match for Voice DNA + performance patterns + topic
2. "Different angle" — same topic, different perspective or hook style
3. "Alternative format" — different format (e.g. if recommended is Educational, try Personal story or Contrarian)

EACH VERSION MUST:
- Open with a strong hook
- Use the user's tone, sentence structure, paragraph style
- Include a CTA matching their CTA style
- Include an imageQuery: 2-4 word search query for relevant stock photo

Return JSON:
{
  "performance_analysis": {
    "top_topics": ["topic1", "topic2"],
    "top_hook_patterns": ["hook1", "hook2"],
    "top_structures": ["structure1", "structure2"],
    "top_formats": ["format1"],
    "best_length": "medium",
    "best_posting_window": "weekday mornings",
    "key_audience_signals": ["signal1", "signal2"]
  },
  "content_opportunities": [
    {
      "topic": "topic",
      "why_now": "why this is timely",
      "historical_connection": "how this connects to past performance",
      "trend_connection": "how this connects to trends",
      "audience_relevance": "why audience cares",
      "potential_hook": "hook idea",
      "opportunity_score": 85
    }
  ],
  "selected_opportunity": {
    "topic": "selected topic",
    "reason": "why selected",
    "score": 90
  },
  "hooks": [
    { "hook": "hook text", "style": "contrarian", "score": 85 }
  ],
  "versions": [
    {
      "id": "v1",
      "label": "Recommended",
      "content": "full post content",
      "hook": "first line of the post",
      "format": "${format || "Educational"}",
      "scores": { "overall": 85, "voiceFit": 90 },
      "imageQuery": "2-4 word search query for stock photo",
      "structure": "Hook → Story → Lesson"
    },
    {
      "id": "v2",
      "label": "Different angle",
      "content": "...",
      "hook": "first line",
      "format": "Different format",
      "scores": { "overall": 80, "voiceFit": 85 },
      "imageQuery": "2-4 word search query",
      "structure": "Opinion → Explanation → CTA"
    },
    {
      "id": "v3",
      "label": "Alternative format",
      "content": "...",
      "hook": "first line",
      "format": "Different format",
      "scores": { "overall": 82, "voiceFit": 88 },
      "imageQuery": "2-4 word search query",
      "structure": "Question → Answer → Lesson"
    }
  ],
  "reasoning_summary": {
    "why_this_topic": "...",
    "why_this_hook": "...",
    "why_this_structure": "...",
    "what_historical_signal_influenced_it": "...",
    "what_trend_influenced_it": "..."
  },
  "confidence": {
    "overall": "HIGH | MEDIUM | LOW",
    "performance_data": "HIGH | MEDIUM | LOW",
    "trend_signal": "HIGH | MEDIUM | LOW",
    "voice_dna": "HIGH | MEDIUM | LOW"
  },
  "metadata": {
    "model": "${process.env.AI_MODEL || "gpt-4o"}",
    "voiceDnaVersionUsed": ${voiceProfile.version},
    "confidenceScore": ${voiceProfile.confidenceScore}
  }
}

RULES:
- If voiceProfile.confidenceScore < 0.4, add a note in confidence: "Based on limited samples — results may feel generic until you add more."
- Each version should feel distinctly different in angle, not just reworded
- The hook should be the first line (before any line break)
- Use line breaks for readability (LinkedIn-style formatting)
- Do NOT use phrases like "In today's fast-paced world", "Let's dive in", "Here's the thing", "Stop scrolling", "I'm going to share"
- Be specific and concrete — avoid vague generalities
- If you cannot determine performance patterns from the data, explicitly mark confidence as LOW and explain why
`;
}
