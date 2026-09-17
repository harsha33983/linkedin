import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, AiGenerationError } from "@/lib/errors/api-errors";
import { withFailover } from "@/lib/ai/types";
import { checkRateLimitRedis } from "@/lib/rate-limit/redis-limiter";
import type { ActivityProfile } from "@/types";
import { readPostMetrics } from "@/lib/linkedin/metrics";

/**
 * POST /api/ai/generate-ideas — Generate content ideas from the user's REAL
 * profile + activity, not generic topics.
 *
 * Signals gathered:
 * - User profile (expertise, audience, goals, occupation)      — who they are
 * - Voice DNA (row + NLP)                                       — how they write
 * - Published posts + engagement metrics                        — what they actually do
 * - What they have posted recently (topics/hooks/formats)      — anti-repetition
 * - Performance / Audience / Trend DNA summaries (if measured) — what works & what's timely
 * - Library state: active ideas + dismissed ideas              — anti-repeat / learn from rejection
 *
 * Falls back to a deterministic, activity-aware generator when AI is down.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request);
    const rl = await checkRateLimitRedis(`ai:ideas:${userId}`, 40, 60 * 60 * 1000);
    if (!rl.allowed) {
      return Response.json({ success: false, error: "Rate limit exceeded. Please try again later.", resetAt: rl.resetAt }, { status: 429 });
    }

    const [voiceProfile, [userProfile], published, recentGenerations, ideas, perfRow, audRow, trendRow] =
      await Promise.all([
        sql`SELECT * FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1`,
        sql`SELECT * FROM user_profiles WHERE "userId" = ${userId} LIMIT 1`,
        sql`
          SELECT topic, format, content, "publishingResponse", "publishedAt"
          FROM posts
          WHERE "userId" = ${userId} AND status = 'PUBLISHED'
            AND content IS NOT NULL AND length(content) > 20
          ORDER BY "publishedAt" DESC LIMIT 80
        `,
        sql`
          SELECT output FROM generations
          WHERE "userId" = ${userId} AND type = 'post'
          ORDER BY "createdAt" DESC LIMIT 15
        `,
        sql`
          SELECT title, status FROM content_ideas
          WHERE "userId" = ${userId} AND status IN ('active', 'dismissed')
        `,
        sql`SELECT * FROM performance_dna WHERE "userId" = ${userId} LIMIT 1`,
        sql`SELECT * FROM audience_dna WHERE "userId" = ${userId} LIMIT 1`,
        sql`SELECT * FROM trend_dna WHERE "userId" = ${userId} LIMIT 1`,
      ]);

    const expertise: string[] = userProfile?.expertise || [];
    const audience: string[] = userProfile?.targetAudience || [];
    const goals: string[] = userProfile?.linkedinGoals || [];

    // Voice DNA — pass the full stored profile (tone/commonTopics/metadata
    // included); when missing, hand the providers a minimal neutral default.
    const voice = (voiceProfile as any) || {
      id: "none",
      userId,
      version: 0,
      confidenceScore: 0,
      sampleCount: 0,
      userConfirmed: false,
      lastUpdated: new Date().toISOString(),
      tone: ["conversational"],
      sentenceStyle: "medium",
      paragraphStyle: "medium",
      hookPatterns: ["story"],
      ctaStyle: "none",
      emojiUsage: "low",
      commonTopics: [],
      wordsToAvoid: [],
      writingPatterns: {},
      sourceWeighting: {},
      metadata: { expertise, occupation: userProfile?.occupation || null },
    };

    // Real activity: deterministic aggregate of what the user actually posted.
    const activityProfile = computeActivityProfile(
      (published as any[]) || [],
      (recentGenerations as any[]) || []
    );

    const previousContent = (published as any[])
      .filter((p) => p.topic || p.content)
      .slice(0, 20)
      .map((p) => p.topic || firstLine(p.content));

    const dismissedIdeas = ((ideas as any[]) || []).filter((i) => i.status === "dismissed").map((i) => i.title);
    const activeIdeas = ((ideas as any[]) || []).filter((i) => i.status === "active").map((i) => i.title);

    const generationParams: any = {
      expertise,
      targetAudience: audience,
      goals,
      voiceProfile: voice,
      previousContent,
      rejectionHistory: dismissedIdeas,
      activeIdeas,
      activityProfile,
      performanceSummary: perfRow && (perfRow as any).sampleSize > 0 ? formatPerformanceSummary(perfRow as any) : undefined,
      audienceSummary: audRow && (audRow as any).sampleSize > 0 ? formatAudienceSummary(audRow as any) : undefined,
      trendSummary: trendRow ? formatTrendSummary(trendRow as any) : undefined,
    };

    let result;
    let usedFallback = false;
    try {
      const { result: generated } = await withFailover(
        (provider) => provider.generateIdeas(generationParams),
        (r) => Array.isArray((r as any)?.ideas) && (r as any).ideas.length > 0
      );
      result = generated;
    } catch (aiError) {
      console.warn(
        "[Ideas] AI generation failed, using activity-aware fallback:",
        (aiError as Error)?.message?.slice(0, 120)
      );
      usedFallback = true;
      result = {
        ideas: buildLocalIdeas({ expertise, audience, goals, voice, activityProfile }),
        metadata: { model: "local-templates" },
      };
    }

    if (!result.ideas.length) {
      throw new AiGenerationError("Idea generation failed. Please try again.");
    }

    await sql`
      INSERT INTO generations (
        id, "userId", type, input, output, model, "voiceDnaVersionUsed"
      ) VALUES (
        gen_random_uuid(), ${userId}, 'idea',
        ${JSON.stringify({ expertise, activitySnapshot: activityProfile })}::jsonb,
        ${JSON.stringify(result)}::jsonb,
        ${usedFallback ? "local-templates" : (process.env.AI_MODEL || "gpt-4o")},
        ${(voice as any).version || 0}
      )
    `;

    return Response.json({ success: true, data: result, usedFallback });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── Activity profile ──────────────────────────────────────────────

function classifyHook(firstLine: string): string {
  const lower = (firstLine || "").toLowerCase().trim();
  if (lower.startsWith("i ") || lower.startsWith("my ") || lower.startsWith("when i ")) return "personal_story";
  if ((firstLine || "").trim().endsWith("?")) return "question";
  if (/^(stop|don'?t|never|everyone)/.test(lower)) return "contrarian";
  if (/^\d+[.)\s]/.test(firstLine)) return "number_list";
  if (/^(here'?s|this is|the truth)/.test(lower)) return "direct_statement";
  if (lower.includes("most people")) return "strong_opinion";
  return "curiosity_gap";
}

function firstLine(content: string): string {
  return (content || "").split("\n").find((l) => l.trim().length > 0)?.slice(0, 90) || "";
}

function computeActivityProfile(
  published: any[],
  recentGenerations: any[]
): ActivityProfile {
  const measured: Array<{ topic: string; format: string; hook: string; engagementRate: number }> = [];
  const topicStats = new Map<string, { posts: number; best: number; avgSum: number; measured: number }>();
  const formatStats = new Map<string, { posts: number; avgSum: number; measured: number }>();
  const hookStats = new Map<string, { posts: number; avgSum: number; measured: number }>();
  const recentTopics: string[] = [];
  const recentHooks: string[] = [];

  for (const post of published) {
    const topic = (post.topic || "").trim();
    const format = (post.format || "").trim() || "Text";
    const hook = classifyHook(firstLine(post.content));
    const m = readPostMetrics(post.publishingResponse);
    const hasMetrics = m.real; // ONLY real LinkedIn measurements count
    const { impressions, engagementRate } = m;

    if (topic) {
      const s = topicStats.get(topic) || { posts: 0, best: 0, avgSum: 0, measured: 0 };
      s.posts += 1;
      if (hasMetrics) {
        s.best = Math.max(s.best, engagementRate);
        s.avgSum += engagementRate;
        s.measured += 1;
      }
      topicStats.set(topic, s);
      if (!recentTopics.includes(topic)) recentTopics.push(topic);
    }

    const f = formatStats.get(format) || { posts: 0, avgSum: 0, measured: 0 };
    f.posts += 1;
    if (hasMetrics) {
      f.avgSum += engagementRate;
      f.measured += 1;
    }
    formatStats.set(format, f);

    const h = hookStats.get(hook) || { posts: 0, avgSum: 0, measured: 0 };
    h.posts += 1;
    if (hasMetrics) {
      h.avgSum += engagementRate;
      h.measured += 1;
    }
    hookStats.set(hook, h);

    if (hasMetrics) {
      measured.push({ topic: topic || "untagged", format, hook, engagementRate });
    }
    if (recentHooks.length < 5) recentHooks.push(firstLine(post.content));
  }

  // Recent hooks from generated (not necessarily published) posts too.
  for (const g of recentGenerations) {
    const output = g.output as any;
    const versions = Array.isArray(output?.versions) ? output.versions : [];
    for (const v of versions.slice(0, 3)) {
      const hookText = v?.hook || firstLine(v?.content);
      if (hookText && !recentHooks.includes(hookText)) recentHooks.push(hookText);
    }
  }

  const avg = (n: number, count: number) => (count > 0 ? n / count : 0);

  const topTopics = Array.from(topicStats.entries())
    .map(([topic, s]) => ({
      topic,
      posts: s.posts,
      bestEngagement: s.best,
      avgEngagement: avg(s.avgSum, s.measured),
    }))
    .sort((a, b) => b.posts - a.posts || b.bestEngagement - a.bestEngagement)
    .slice(0, 8);

  const topFormats = Array.from(formatStats.entries())
    .map(([format, s]) => ({ format, posts: s.posts, avgEngagement: avg(s.avgSum, s.measured) }))
    .sort((a, b) => b.posts - a.posts || b.avgEngagement - a.avgEngagement)
    .slice(0, 6);

  const topHooks = Array.from(hookStats.entries())
    .map(([hook, s]) => ({ hook, posts: s.posts, avgEngagement: avg(s.avgSum, s.measured) }))
    .sort((a, b) => b.posts - a.posts || b.avgEngagement - a.avgEngagement)
    .slice(0, 6);

  const bestPerformingPosts = [...measured]
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 5);

  const sampleSize = measured.length;
  const avgEngagementRate = sampleSize > 0 ? measured.reduce((s, m) => s + m.engagementRate, 0) / sampleSize : 0;

  return {
    publishedCount: published.length,
    sampleSize,
    avgEngagementRate,
    topTopics,
    topFormats,
    topHooks,
    bestPerformingPosts,
    recentTopics: recentTopics.slice(0, 8),
    recentHooks: recentHooks.slice(0, 5),
  };
}

// ─── DNA summaries (only from measured data — never fabricated) ───

function formatPerformanceSummary(row: any): string {
  const top = (obj: any, n = 3) =>
    Object.entries(obj || {})
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, n)
      .map(([k, v]) => `${k} (${v})`)
      .join(", ");
  return `Confidence ${Math.round(row.confidenceScore * 100)}%, ${row.sampleSize} samples.
- Best topics: ${top(row.topicScores)}
- Best hooks: ${top(row.hookScores)}
- Best formats: ${top(row.formatScores, 2)}
- Avg engagement rate: ${(row.avgEngagementRate * 100).toFixed(1)}%
- Underperforming: ${(row.underperformingPatterns || []).join("; ") || "none identified"}`;
}

function formatAudienceSummary(row: any): string {
  const profile = row.audienceProfile || {};
  return `Confidence ${Math.round(row.confidenceScore * 100)}%, ${row.sampleSize} samples.
- Primary interests: ${(profile.primaryInterests || []).join(", ") || "unknown"}
- Engagement style: ${profile.engagementStyle || "unknown"}
- Response patterns: ${(row.shareTriggers || []).slice(0, 3).join("; ") || "unknown"}
- Avg impressions: ${Math.round(row.avgImpressions || 0)}, avg comments: ${Math.round(row.avgComments || 0)}`;
}

function formatTrendSummary(row: any): string {
  const trends = (row.activeTrends || [])
    .slice(0, 5)
    .map((t: any) => `${t.topic} (relevance ${t.relevance}, strength ${t.trendStrength}/10)`)
    .join("\n- ");
  return `Freshness ${Math.round((row.freshnessScore || 0) * 100)}%.
- Active trends:\n- ${trends || "none"}
- Evergreen: ${(row.evergreenTopics || []).join(", ") || "none"}`;
}

// ─── Deterministic, activity-aware fallback ───────────────────────

function buildLocalIdeas(ctx: {
  expertise: string[];
  audience: string[];
  goals: string[];
  voice: any;
  activityProfile: ActivityProfile;
}): any[] {
  const { expertise, audience, activityProfile, voice } = ctx;
  const activity = activityProfile || ({} as ActivityProfile);

  const covered = new Set([
    ...(activity.recentTopics || []),
    ...(activity.topTopics || []).map((t) => t.topic),
  ]);

  // Content gaps first: expertise they have never posted about.
  const gaps = expertise.filter(
    (e) => !Array.from(covered).some((c) => c.toLowerCase().includes(e.toLowerCase()))
  );

  // Then topics they demonstrably post about most (their real activity).
  const strongTopics = (activity.topTopics || []).map((t) => t.topic);

  const voiceTopics = Array.isArray(voice.commonTopics) ? voice.commonTopics.slice(0, 3) : [];

  const pool: Array<{ topic: string; kind: "gap" | "activity" | "voice" }> = [
    ...gaps.slice(0, 3).map((t) => ({ topic: t, kind: "gap" as const })),
    ...strongTopics.slice(0, 3).map((t) => ({ topic: t, kind: "activity" as const })),
    ...voiceTopics
      .filter((t: string) => !covered.has(t) && !gaps.includes(t))
      .slice(0, 2)
      .map((t: string) => ({ topic: t, kind: "voice" as const })),
  ];
  const uniquePool = pool.filter(
    (p, i, arr) => arr.findIndex((x) => x.topic === p.topic) === i
  );

  const audienceLabel = (audience || [])[0] || "your audience";

  const formatsByIndex = ["Educational", "Personal story", "Contrarian", "Listicle", "Framework", "Opinion"];

  // Prefer the format the user actually posts most (when activity exists).
  const preferredFormat = (activity.topFormats || [])[0]?.format;

  const structures: Array<{
    format: string;
    title: (topic: string) => string;
    reason: (topic: string, kind: "gap" | "activity" | "voice") => string;
  }> = [
    {
      format: "Lesson learned",
      title: (t) => `The hardest ${t.toLowerCase()} lesson I learned the slow way`,
      reason: (_t, kind) =>
        kind === "gap"
          ? "Content gap: this is in your expertise but you have never posted about it — a personal take would establish it."
          : "Your posts on this topic are among your most consistent activity; a personal lesson adds depth.",
    },
    {
      format: "Contrarian",
      title: (t) => `What nobody tells you about ${t.toLowerCase()}`,
      reason: () => "Contrarian takes on topics you already own tend to drive discussion.",
    },
    {
      format: "Framework",
      title: (t) => `A simple framework for ${t.toLowerCase()} that most people skip`,
      reason: () => "Frameworks are saveable and match your topic history.",
    },
    {
      format: "Educational",
      title: (t) => `How I'd explain ${t.toLowerCase()} to someone starting from zero`,
      reason: () => `Clear educational posts attract ${audienceLabel} early in their journey.`,
    },
    {
      format: "Listicle",
      title: (t) => `3 ${t.toLowerCase()} mistakes I see every week`,
      reason: () => "Numbered lists make the post easy to scan and act on.",
    },
    {
      format: "Opinion",
      title: (t) => `Why I changed my mind about ${t.toLowerCase()}`,
      reason: () => "Opinions backed by a change of mind read as authentic.",
    },
  ];

  const ideas: any[] = [];
  let idx = 0;
  for (const entry of uniquePool) {
    const structure = structures[idx % structures.length];
    idx += 1;
    const title = structure.title(entry.topic);
    // Activity-backed ideas reuse the format that actually works for them.
    const format = entry.kind === "activity" && preferredFormat ? preferredFormat : structure.format;
    const reason = structure.reason(entry.topic, entry.kind);
    ideas.push({ title, description: reason, topic: entry.topic, format, suggestionReason: reason });
    if (ideas.length >= 6) break;
  }

  // No expertise/topics at all → generic-but-useful starter structures.
  if (ideas.length === 0) {
    const occupation = (voice.metadata as any)?.occupation;
    const base =
      occupation && occupation !== "Other"
        ? occupation.toLowerCase()
        : "your work";
    ideas.push(
      {
        title: `What I learned in my first year of ${base}`,
        description: "Turn your own journey into a story others can learn from.",
        format: "Personal story",
        suggestionReason: "Personal stories build connection with your audience.",
      },
      {
        title: `3 things I wish I knew before starting ${base}`,
        description: "Actionable, experience-based advice in an easy-to-scan list.",
        format: "Listicle",
        suggestionReason: "Numbered lists perform well for actionable advice.",
      },
      {
        title: `The biggest misconception about ${base}`,
        description: "Challenge a common belief in your space with your perspective.",
        format: "Contrarian",
        suggestionReason: "Contrarian takes spark discussion.",
      }
    );
  }

  return ideas.slice(0, 6);
}
