/**
 * AI originality pipeline.
 *
 * analyzeViralPost → why the post works (patterns ONLY, no copying).
 * generateOriginalIdeas → 5 completely original concepts adapted to the
 * user's expertise/audience, driven by a strict anti-copy system prompt.
 *
 * When AI is unavailable, a deterministic NLP fallback produces pattern-level
 * analysis and idea skeletons from the post's STRUCTURE (never its wording).
 */

import { chatJson } from "@/lib/ai/chat-json";
import type { UserContentContext } from "./context";

// ─── Types ────────────────────────────────────────────────────────

export interface PostAnalysis {
  whyItWorks: string[];
  hookPattern: string;
  contentStructure: string;
  audience: string;
  emotionalTrigger: string;
  engagementMechanism: string;
  topic: string;
  format: string;
}

export interface OriginalIdea {
  title: string;
  hook: string;
  angle: string;
  format: string;
  outline: string[];
  whyItCouldWork: string;
  cta: string;
}

export const ORIGINALITY_SYSTEM_PROMPT = `You are analyzing a high-performing social post for content strategy.

Do not copy the source content.
Do not reproduce distinctive phrases.
Do not imitate the author's personal writing style.
Do not reproduce the same story.
Do not paraphrase the original post.

Extract only high-level patterns such as:
- hook structure
- topic
- audience problem
- content format
- psychological mechanism
- CTA pattern

Then generate completely original content concepts adapted to the user's:
- expertise
- niche
- target audience
- experience
- notes.

The output must be substantially different from the source.`;

// ─── Helpers ──────────────────────────────────────────────────────

function extractJson(raw: string): string {
  const cleaned = raw.replace(/```json/gi, "```").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return cleaned.trim();
  return cleaned.slice(start, end + 1);
}

/** Deterministic hook-pattern classifier (NLP-level, no AI needed). */
export function classifyHookPattern(content: string): string {
  const first = (content || "").trim().split("\n")[0] || "";
  const lower = first.toLowerCase();
  if (/^\d+[\).]?\s/.test(first)) return "numbered list opener";
  if (lower.includes("most people") || lower.includes("everyone")) return "contrarian common-belief opener";
  if (/^(i|my|we|our)\b/.test(lower)) return "personal story opener";
  if (first.trim().endsWith("?")) return "question opener";
  if (lower.startsWith("stop") || lower.startsWith("unpopular")) return "pattern-interrupt opener";
  return "curiosity-gap opener";
}

function clampStr(v: unknown, fallback: string, max = 220): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s.slice(0, max) : fallback;
}

function strArray(v: unknown, max = 6): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max);
}

// ─── Analysis ─────────────────────────────────────────────────────

function localAnalysis(content: string): PostAnalysis {
  const lines = (content || "").split("\n").filter((l) => l.trim());
  const listy = lines.filter((l) => /^\s*([-•*]|\d+[\).])\s/.test(l)).length >= 3;
  const hasStory = /\b(when|i|we)\b/i.test(lines[1] || "") && lines.length > 4;

  return {
    whyItWorks: [
      "Opens with a pattern that creates immediate curiosity before explaining anything.",
      "Keeps paragraphs short, which suits how people scan feeds on mobile.",
      "Anchors the claim in the author's own experience instead of abstract advice.",
    ],
    hookPattern: classifyHookPattern(content),
    contentStructure: listy ? "Hook → scannable list → takeaway" : hasStory ? "Hook → short story → lesson → CTA" : "Hook → argument → takeaway",
    audience: "Practitioners in the post's topic area who want practical, experience-backed insight",
    emotionalTrigger: "Curiosity plus a hint of social proof through the engagement count",
    engagementMechanism: "Readers recognize their own situation in the problem, which invites comments and shares",
    topic: clampStr(lines[0], "professional growth", 80),
    format: listy ? "Listicle" : hasStory ? "Personal story" : "Opinion",
  };
}

export async function analyzeViralPost(
  post: { content: string | null; reactions: number | null; comments: number | null; viralScore: number },
  ctx: UserContentContext
): Promise<{ analysis: PostAnalysis; usedAi: boolean; model: string | null }> {
  const fallback = localAnalysis(post.content || "");
  if (!post.content || post.content.trim().length < 40) {
    return { analysis: fallback, usedAi: false, model: null };
  }

  const userPrompt = `SOURCE POST (for pattern analysis only — never copy it):
"""
${post.content.slice(0, 2500)}
"""
Engagement observed: ${post.reactions ?? "unknown"} reactions, ${post.comments ?? "unknown"} comments. Viral score: ${post.viralScore}/100.

USER CONTEXT (adapt everything to THIS person):
- Job title: ${ctx.jobTitle || "unknown"}
- Expertise: ${ctx.expertise.join(", ") || "unknown"}
- Target audience: ${ctx.targetAudience.join(", ") || "unknown"}
- Industry: ${ctx.industry || "unknown"}

Return ONLY valid JSON:
{
  "whyItWorks": ["3-5 specific structural reasons this post performs well"],
  "hookPattern": "the hook STRUCTURE in 2-5 words (e.g. 'contrarian common-belief opener')",
  "contentStructure": "format skeleton, e.g. 'Hook → list → lesson'",
  "audience": "who this post resonates with",
  "emotionalTrigger": "primary psychological driver",
  "engagementMechanism": "why people comment/share it",
  "topic": "the post's topic area in 2-4 words",
  "format": "one of: Educational, Personal story, Contrarian, Opinion, Listicle, Framework, Case study, Lesson learned"
}`;

  try {
    const { data, provider } = await chatJson(ORIGINALITY_SYSTEM_PROMPT, userPrompt);
    const result = data as Record<string, unknown>;
    return {
      analysis: {
        whyItWorks: strArray(result.whyItWorks, 5).length
          ? strArray(result.whyItWorks, 5)
          : fallback.whyItWorks,
        hookPattern: clampStr(result.hookPattern, fallback.hookPattern, 60),
        contentStructure: clampStr(result.contentStructure, fallback.contentStructure, 140),
        audience: clampStr(result.audience, fallback.audience),
        emotionalTrigger: clampStr(result.emotionalTrigger, fallback.emotionalTrigger),
        engagementMechanism: clampStr(result.engagementMechanism, fallback.engagementMechanism),
        topic: clampStr(result.topic, fallback.topic, 60),
        format: clampStr(result.format, fallback.format, 40),
      },
      usedAi: true,
      model: provider,
    };
  } catch {
    return { analysis: fallback, usedAi: false, model: null };
  }
}

// ─── Original ideas ───────────────────────────────────────────────

function localIdeas(analysis: PostAnalysis, ctx: UserContentContext): OriginalIdea[] {
  const topicArea = analysis.topic.replace(/[^\w\s]/g, "").trim() || "your field";
  const exp = ctx.expertise[0] || ctx.jobTitle || "your work";
  const aud = ctx.targetAudience[0] || "your audience";
  const formats = ["Personal story", "Contrarian", "Listicle", "Framework", "Lesson learned"];

  return formats.map((format, i) => ({
    title: [
      `The ${topicArea} lesson I only learned after doing ${exp} wrong`,
      `Why most ${topicArea} advice fails ${aud}`,
      `3 ${topicArea} mistakes I see every week (and what to do instead)`,
      `My simple ${topicArea} framework, in five steps`,
      `What changed my mind about ${topicArea}`,
    ][i],
    hook: [
      `I got ${topicArea} wrong for two years before the pattern clicked.`,
      `Most ${topicArea} advice is written for the wrong audience.`,
      `Every week I watch the same three ${topicArea} mistakes repeat.`,
      `${topicArea} does not need another theory. It needs a checklist.`,
      `I used to believe the opposite of what I am about to say.`,
    ][i],
    angle: `Adapted from the source's ${analysis.hookPattern} — same mechanism, completely different story and topic framing, grounded in your own ${exp} experience.`,
    format,
    outline: [
      `Open with the ${analysis.hookPattern}`,
      `Your specific experience with ${topicArea} (one concrete moment, no invented numbers)`,
      `The lesson for ${aud}`,
      `Close with your own ${ctx.goals[0] || "perspective"} angle`,
    ],
    whyItCouldWork: `Reuses the proven ${analysis.hookPattern} structure and ${analysis.emotionalTrigger} trigger, applied to YOUR ${topicArea} experience — substantial distance from the source post.`,
    cta: ctx.goals[0]?.includes("engage")
      ? "Ask readers which mistake they recognize."
      : "Invite readers to share their own approach.",
  }));
}

export async function generateOriginalIdeas(
  analysis: PostAnalysis,
  ctx: UserContentContext,
  source: { content: string | null }
): Promise<{ ideas: OriginalIdea[]; usedAi: boolean; model: string | null }> {
  const fallback = localIdeas(analysis, ctx);

  const userPrompt = `SOURCE POST (patterns already extracted — do NOT reuse its wording, story, or examples):
"""
${(source.content || "").slice(0, 1200)}
"""

ANALYSIS (from the source, high-level patterns only):
- Hook structure: ${analysis.hookPattern}
- Format skeleton: ${analysis.contentStructure}
- Emotional trigger: ${analysis.emotionalTrigger}
- Engagement mechanism: ${analysis.engagementMechanism}

USER CONTEXT (ideas must fit THIS person):
- Job title: ${ctx.jobTitle || "unknown"}
- Expertise: ${ctx.expertise.join(", ") || "unknown"}
- Target audience: ${ctx.targetAudience.join(", ") || "unknown"}
- Goals: ${ctx.goals.join(", ") || "unknown"}
- Niche: ${ctx.niche.join(", ") || "unknown"}
- Notes: ${ctx.notes.join(" | ") || "none"}

Generate 5 COMPLETELY ORIGINAL content ideas for this person. Each must be
substantially different from the source post: different story, different
examples, different phrasing. Reuse only the abstract pattern.

Return ONLY valid JSON:
{"ideas": [{"title": "", "hook": "", "angle": "", "format": "Educational|Personal story|Contrarian|Opinion|Listicle|Framework|Case study|Lesson learned", "outline": ["3-4 beats"], "whyItCouldWork": "", "cta": ""}]}`;

  try {
    const { data, provider } = await chatJson(ORIGINALITY_SYSTEM_PROMPT, userPrompt);
    const result = (data as { ideas?: unknown[] }) || {};

    const ideas = ((result.ideas as any[]) || [])
      .slice(0, 5)
      .map((idea, i) => ({
        title: clampStr(idea.title, fallback[i]?.title || `Original idea ${i + 1}`, 140),
        hook: clampStr(idea.hook, fallback[i]?.hook || "", 300),
        angle: clampStr(idea.angle, fallback[i]?.angle || "", 300),
        format: clampStr(idea.format, fallback[i]?.format || "Educational", 40),
        outline: strArray(idea.outline, 6).length ? strArray(idea.outline, 6) : fallback[i]?.outline || [],
        whyItCouldWork: clampStr(idea.whyItCouldWork, fallback[i]?.whyItCouldWork || "", 300),
        cta: clampStr(idea.cta, fallback[i]?.cta || "", 200),
      }));

    if (ideas.length === 0) return { ideas: fallback, usedAi: false, model: null };

    // Depth check: ideas must not share long n-grams with the source.
    const sourceLower = (source.content || "").toLowerCase();
    const tooClose = ideas.filter((idea) => {
      const words = (idea.hook + " " + idea.title).toLowerCase().split(/\s+/);
      const window = 8;
      for (let i = 0; i + window <= words.length; i++) {
        const gram = words.slice(i, i + window).join(" ");
        if (gram.length > 20 && sourceLower.includes(gram)) return true;
      }
      return false;
    });
    if (tooClose.length > 0) {
      // Replace offending ideas with deterministic originals (fail-closed).
      for (const bad of tooClose) {
        const fb = fallback.find((f) => f.title !== bad.title) || localIdeas(analysis, ctx)[0];
        Object.assign(bad, fb);
      }
    }

    return { ideas, usedAi: true, model: provider };
  } catch {
    return { ideas: fallback, usedAi: false, model: null };
  }
}
