import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { getProvider, getSecondaryProvider } from "@/lib/ai/types";
import { fetchPostImage } from "@/lib/ai/image-fetch";
import { checkRateLimitRedis } from "@/lib/rate-limit/redis-limiter";
import { PostStreamParser } from "@/lib/ai/post-stream-parser";
import {
  buildPostGenerationContext,
  buildNeutralVoiceProfile,
} from "@/lib/ai/post-generation-context";
import { generatePostLocally } from "@/lib/ai/local-generator";
import { analyzeWritingWithNLP } from "@/lib/voice/nlp-analyzer";
import { selectStructure } from "@/lib/ai/post-structure";
import { buildHumanizerBlock, UserFacts } from "@/lib/ai/humanizer";
import { analyzeContentQuality, shouldRegenerate, buildCorrectionInstructions, MAX_REGENERATIONS } from "@/lib/ai/content-quality";
import { retrieveStyleExamples, formatExamplesForPrompt, storeWritingExample } from "@/lib/ai/style-examples";
import { getLearnedStyleAdjustments } from "@/lib/ai/edit-learning";
import { routeGenerate, logGeneration } from "@/lib/ai/llm-router";
import { getProviderByName } from "@/lib/ai/provider-registry";
import { buildStyleContext, qualityGate } from "@/lib/ai/generation-context";
import { z } from "zod";

const generatePostSchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  goal: z.string().optional(),
  format: z
    .enum([
      "Educational",
      "Personal story",
      "Contrarian",
      "Opinion",
      "Listicle",
      "Framework",
      "Case study",
      "Lesson learned",
      "Announcement",
      "Promotional",
    ])
    .optional(),
  tone: z.string().optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
  targetAudience: z.string().optional(),
  // User-provided FACTS — the strongest personalization input. All optional.
  whatHappened: z.string().max(2000).optional(),
  whatLearned: z.string().max(2000).optional(),
  result: z.string().max(2000).optional(),
});

/**
 * POST /api/ai/generate-post/stream — token-by-token post generation.
 *
 * Response: newline-delimited JSON events (NDJSON):
 *   {"type":"status","provider":"groq"}          — which tier is generating
 *   {"type":"version_start",...}                  — a version card appears
 *   {"type":"content","index":0,"delta":"..."}    — a text delta for the card
 *   {"type":"version_done","index":0}             — card's text complete
 *   {"type":"done", result:{...}}                 — final full result (images, ids, generationId)
 *   {"type":"error","error":"..."}                — fatal
 *
 * 3-tier failover, all streaming:
 *   1. Primary provider (Groq) — streams
 *   2. Secondary provider (OpenRouter) — streams
 *   3. NLP local generator — no LLM at all; content is emitted line-by-line
 *      with a tiny delay so the UI still shows progressive rendering.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const parsed = generatePostSchema.parse(body);

    const rateLimit = await checkRateLimitRedis(`ai:post-gen-stream:${userId}`, 20, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return Response.json(
        { success: false, error: "Rate limit exceeded. Please try again later.", resetAt: rateLimit.resetAt },
        { status: 429 }
      );
    }

    // Build all context BEFORE streaming starts (fail fast, honest errors).
    const ctx = await buildPostGenerationContext(userId, parsed);

    // Structure + humanizer + RAG style context (new architecture)
    const styleCtx = await buildStyleContext(userId, parsed, ctx.voiceProfile);
    // Recent hooks for the quality gate's repetition check
    const recentHooksForQuality = (ctx.allRecentPosts || [])
      .map((p: any) => (p.content || "").split("\n")[0])
      .filter(Boolean)
      .slice(0, 8);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: any) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        };

        try {
          const genStarted = Date.now();
          const result = await generateWithFailover(parsed, ctx, styleCtx, recentHooksForQuality, send, userId);

          logGeneration({
            requestType: "generate-post-stream",
            provider: result.metadata?.model || "unknown",
            model: process.env.AI_MODEL,
            taskComplexity: "HIGH", latencyMs: Date.now() - genStarted,
            status: result.metadata?.model === "local-nlp" ? "fallback" : "success",
            promptName: "linkedin_post_stream", promptVersion: "v2", userId,
          });

          // Images for each version (parallel)
          const imageUrls = await Promise.all(
            result.versions.map((v: any) => fetchPostImage(v.imageQuery || parsed.topic))
          );
          result.versions.forEach((v: any, i: number) => {
            v.imageUrl = imageUrls[i] || undefined;
          });

          // Store the generation record
          let generationId = "";
          try {
            const [gen] = await sql`
              INSERT INTO generations (
                id, "userId", type, input, output, model, "voiceDnaVersionUsed"
              ) VALUES (
                gen_random_uuid(), ${userId}, 'post', ${JSON.stringify(parsed)}::jsonb,
                ${JSON.stringify(result)}::jsonb, ${result.metadata.model},
                ${(ctx.voiceProfile as any)?.version ?? 0}
              )
              RETURNING id
            `;
            generationId = gen?.id || "";
          } catch (dbError: any) {
            console.warn("[Stream] Failed to store generation:", dbError?.message?.slice(0, 120));
          }

          send({
            type: "done",
            result: {
              ...result,
              generationId,
              metadata: {
                ...result.metadata,
                voiceDnaVersionUsed: (ctx.voiceProfile as any)?.version ?? 0,
                confidenceScore: (ctx.voiceProfile as any)?.confidenceScore ?? 0.2,
              },
            },
          });
        } catch (err: any) {
          console.error("[Stream] Fatal:", err?.message?.slice(0, 200));
          send({ type: "error", error: err?.message || "Generation failed" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * 3-tier generation with failover. `send` streams progress events to the
 * browser as each tier produces text.
 */
async function generateWithFailover(
  parsed: any,
  ctx: any,
  styleCtx: any,
  recentHooksForQuality: string[],
  send: (obj: any) => void,
  userId: string
): Promise<any> {
  // Provider order comes from the router's classification (HIGH for posts).
  const { getProviderOrder } = await import("@/lib/ai/provider-order");
  const order = getProviderOrder("HIGH")
    .map((n: string) => ({ name: n, provider: getProviderByName(n) }))
    .filter((p: any) => p.provider);
  // Legacy fallback if no env-keyed provider resolves.
  if (order.length === 0) {
    const primary = getProvider();
    const secondary = getSecondaryProvider();
    order.push({ name: primary.name, provider: primary }, { name: secondary.name, provider: secondary });
  }

  const attemptStream = async (provider: any, name: string): Promise<string | null> => {
    // Providers without streamPost (e.g. legacy kimi) can't participate.
    if (typeof provider.streamPost !== "function") {
      console.warn(`[Stream] Provider "${name}" has no streamPost — skipping`);
      return null;
    }

    const parser = new PostStreamParser((event) => {
      // Forward parser events straight to the browser as they derive.
      const { type, ...rest } = event;
      send({ type, ...rest });
    });

    try {
      send({ type: "status", provider: name });
      await provider.streamPost(
        {
          topic: parsed.topic,
          goal: parsed.goal,
          format: parsed.format,
          tone: parsed.tone,
          length: parsed.length,
          targetAudience: parsed.targetAudience,
          voiceProfile: ctx.voiceProfile,
          userProfile: ctx.userProfile,
          recentPosts: ctx.allRecentPosts,
          trendingTopics: ctx.trendingTopics,
          contentPillars: ctx.contentPillars,
          dnaProfile: ctx.dnaProfile,
          // New-architecture context: structure + humanizer constraints + facts
          styleContext: styleCtx,
        },
        (delta: string) => parser.push(delta)
      );
      parser.finish();

      const versions = parser.getVersions();
      if (!versions.length || versions.some((v: any) => !v.content)) {
        throw new Error("Stream produced no usable versions");
      }
      return JSON.stringify({ versions });
    } catch (err: any) {
      console.warn(`[Stream] Provider "${name}" failed:`, String(err?.message || err).slice(0, 160));
      return null;
    }
  };

  // Tier 1..N: providers in router order
  let raw: string | null = null;
  let winningProvider: string | null = null;
  for (const { name, provider } of order) {
    raw = await attemptStream(provider, name);
    if (raw) { winningProvider = name; break; }
  }

  if (raw) {
    const parsedResult = JSON.parse(raw);
    return finalizeLLMResult(parsedResult, parsed, winningProvider || "stream", styleCtx, recentHooksForQuality);
  }

  // Tier 3: NLP local generator (no LLM). Emit content line-by-line so the
  // UI still renders progressively.
  send({ type: "status", provider: "local-nlp" });
  const localResult = await generateLocalWithStreaming(parsed, ctx, send, userId);
  return localResult;
}

/** Shape an LLM streaming result into the standard GeneratePostResult (+ deterministic quality gate). */
function finalizeLLMResult(parsedResult: any, parsed: any, providerName: string, styleCtx?: any, recentHooks?: string[]): any {
  const versions = parsedResult.versions.slice(0, 3).map((v: any) => ({
    id: v.id,
    label: v.label,
    content: v.content,
    hook: v.hook,
    format: v.format,
    scores: v.scores,
    imageQuery: v.imageQuery,
  }));

  // Deterministic quality gate — pure text analysis, zero LLM cost.
  // Advisory at streaming time (text already delivered); the scores are
  // stored and shown so the buffered path can enforce regeneration.
  for (const v of versions) {
    try {
      const q = qualityGate(v.content, styleCtx?.facts || {}, recentHooks || []);
      v.quality = {
        specificity: q.specificity,
        originality: q.originality,
        clarity: q.clarity,
        readability: q.readability,
        aiPatternRisk: q.aiPatternRisk,
      };
    } catch {
      // gate must never break delivery
    }
  }

  return {
    versions,
    analysis: {
      performance_analysis: {},
      content_opportunities: [],
      selected_opportunity: null,
      hooks: [],
      reasoning_summary: {
        why_this_topic: "Generated via streaming pipeline",
        why_this_hook: "",
        why_this_structure: "",
        what_historical_signal_influenced_it: "",
        what_trend_influenced_it: "",
      },
      confidence: { overall: "MEDIUM", performance_data: "LOW", trend_signal: "LOW", voice_dna: "MEDIUM" },
    },
    metadata: {
      model: providerName,
      streamed: true,
    },
    topic: parsed.topic,
  };
}

/**
 * Tier 3: run the NLP local generator and emit its output progressively.
 */
async function generateLocalWithStreaming(
  parsed: any,
  ctx: any,
  send: (obj: any) => void,
  userId: string
): Promise<any> {
  // Build the NLP profile the same way the non-streaming fallback does
  const allSamples = await sql`
    SELECT content FROM writing_samples WHERE "userId" = ${userId} ORDER BY "createdAt" ASC
  `;
  const sampleTexts = (allSamples as any[]).map((s: any) => s.content);
  const allTexts = [...sampleTexts, ...ctx.allRecentPosts.map((p: any) => p.content).filter(Boolean)];
  const uniqueTexts = Array.from(new Map(allTexts.map((t: string) => [t.substring(0, 100), t])).values());

  const nlpProfile =
    uniqueTexts.length > 0 ? analyzeWritingWithNLP(uniqueTexts) : (ctx.voiceProfile as any)?.nlpProfile || analyzeWritingWithNLP([]);

  const local = generatePostLocally({
    topic: parsed.topic,
    goal: parsed.goal,
    format: parsed.format,
    tone: parsed.tone,
    length: parsed.length,
    targetAudience: parsed.targetAudience,
    nlpProfile,
    recentPosts: ctx.allRecentPosts,
  });

  // Emit each version's text line-by-line with a tiny delay so the browser
  // renders it progressively (the local generator is instant otherwise).
  const labels = ["Recommended", "Different angle", "Alternative format"];
  for (let i = 0; i < local.versions.length; i++) {
    const v: any = local.versions[i];
    send({
      type: "version_start",
      index: i,
      label: v.label || labels[i] || `Version ${i + 1}`,
      format: v.format,
      hook: v.hook,
      scores: v.scores,
      imageQuery: v.imageQuery,
    });

    const lines = String(v.content || "").split("\n");
    for (const line of lines) {
      send({ type: "content", index: i, delta: line + "\n" });
      await new Promise((r) => setTimeout(r, 30));
    }
    send({ type: "version_done", index: i });
  }

  return {
    versions: local.versions.map((v: any, i: number) => ({
      ...v,
      id: `v${i + 1}`,
      label: v.label || labels[i] || `Version ${i + 1}`,
    })),
    analysis: local.analysis,
    metadata: { model: "local-nlp", streamed: true },
    topic: parsed.topic,
  };
}
