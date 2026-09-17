import OpenAI from "openai";
import type { AIProvider } from "./types";
import type {
  VoiceAnalysisConfig,
  VoiceAnalysisResult,
  GeneratePostParams,
  GeneratePostResult,
  GenerateHookParams,
  GenerateHookResult,
  GenerateIdeaParams,
  GenerateIdeaResult,
  RewriteParams,
  RewriteResult,
  QualityCheckResult,
  VoiceProfile,
} from "@/types";
import { VOICE_ANALYSIS_PROMPT } from "./prompts/voice-analysis";
import { POST_GENERATION_PROMPT } from "./prompts/post-generation";
import { HOOK_GENERATION_PROMPT } from "./prompts/hook-generation";
import { IDEA_GENERATION_PROMPT } from "./prompts/idea-generation";
import { REWRITE_PROMPT } from "./prompts/rewrite";
import { QUALITY_CHECK_PROMPT } from "./prompts/post-quality-check";
import { POST_GENERATION_STREAM_PROMPT } from "./prompts/post-generation-stream";

const BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const API_KEY = process.env.OPENROUTER_API_KEY || "";
/**
 * Default to a free model so the provider works before credits are purchased.
 * Once credits are added, set OPENROUTER_MODEL to any paid model
 * (e.g. "~openai/gpt-latest", "openai/gpt-4o", "anthropic/claude-sonnet-4").
 */
const MODEL = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free";
/** Used to auto-retry when the configured model needs paid credits. */
const FREE_FALLBACK_MODEL = "nvidia/nemotron-3.5-lightning:free";

/**
 * OpenRouter Provider
 *
 * OpenRouter is OpenAI-API-compatible: one key, hundreds of models.
 * Best for: swapping models without code changes; using free-tier models.
 */
export class OpenRouterProvider implements AIProvider {
  name = "openrouter";
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      baseURL: BASE_URL,
      // Placeholder keeps construction from throwing when the key is missing;
      // requests then fail with 401 and the failover layer takes over.
      apiKey: API_KEY || "missing-openrouter-api-key",
      defaultHeaders: {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3001",
        "X-Title": "LinkedGrow AI",
      },
    });
  }

  /** Pull the JSON object out of a model response, tolerating fences/prose. */
  private extractJson(raw: string): string {
    const cleaned = raw.replace(/```json/gi, "```").replace(/```/g, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return cleaned.trim();
    return cleaned.slice(start, end + 1);
  }

  private async chat(
    systemPrompt: string,
    userPrompt: string,
    model: string = MODEL
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 8192,
    });

    const message: any = response.choices?.[0]?.message;
    // Reasoning models may put everything in `reasoning` when content is empty.
    return (message?.content || message?.reasoning || "").trim();
  }

  /** Run a JSON-returning chat with a credit-failure fallback to a free model. */
  private async chatJson(
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    try {
      const result = await this.chat(systemPrompt, userPrompt);
      return this.extractJson(result);
    } catch (err: any) {
      const msg = String(err?.message || err);
      const status = err?.status;
      // 402 = no credits, 404 = unknown model — retry on the free fallback.
      if (status === 402 || status === 404 || /insufficient credits/i.test(msg)) {
        const result = await this.chat(systemPrompt, userPrompt, FREE_FALLBACK_MODEL);
        return this.extractJson(result);
      }
      throw err;
    }
  }

  async analyzeVoice(
    samples: string[],
    config: VoiceAnalysisConfig
  ): Promise<VoiceAnalysisResult> {
    const prompt = VOICE_ANALYSIS_PROMPT(
      samples,
      config.sourceWeighting || {
        linkedin_post: 1.0,
        blog: 0.6,
        other: 0.4,
      }
    );
    const result = await this.chatJson(
      "You are an expert at analyzing writing styles and voice. Always respond with valid JSON only.",
      prompt
    );
    return JSON.parse(result) as VoiceAnalysisResult;
  }

  async generatePost(params: GeneratePostParams & { recentPosts?: any[]; trendingTopics?: any[]; contentPillars?: string[] }): Promise<GeneratePostResult> {
    const prompt = POST_GENERATION_PROMPT(params);
    const result = await this.chatJson(
      "You are the AI Growth Engine for LinkedIn content. You analyze performance data, find content opportunities, and generate posts that match the user's exact Voice DNA. Always respond with valid JSON only.",
      prompt
    );
    return JSON.parse(result) as GeneratePostResult;
  }

  async generateHooks(
    params: GenerateHookParams
  ): Promise<GenerateHookResult> {
    const prompt = HOOK_GENERATION_PROMPT(params);
    const result = await this.chatJson(
      "You are an expert at crafting compelling LinkedIn hooks. Always respond with valid JSON only.",
      prompt
    );
    return JSON.parse(result) as GenerateHookResult;
  }

  async generateIdeas(
    params: GenerateIdeaParams
  ): Promise<GenerateIdeaResult> {
    const prompt = IDEA_GENERATION_PROMPT(params);
    const result = await this.chatJson(
      "You are an expert at generating personalized LinkedIn content ideas. Always respond with valid JSON only.",
      prompt
    );
    return JSON.parse(result) as GenerateIdeaResult;
  }

  async rewriteContent(params: RewriteParams): Promise<RewriteResult> {
    const prompt = REWRITE_PROMPT(params);
    const result = await this.chatJson(
      "You are an expert at rewriting content to match a specific voice. Always respond with valid JSON only.",
      prompt
    );
    return JSON.parse(result) as RewriteResult;
  }

  async checkQuality(
    content: string,
    voiceProfile: VoiceProfile,
    recentHooks: string[]
  ): Promise<QualityCheckResult> {
    const prompt = QUALITY_CHECK_PROMPT(content, voiceProfile, recentHooks);
    const result = await this.chatJson(
      "You are a content quality reviewer. Check for fabrication, invented anecdotes, and hook repetition. Always respond with valid JSON only.",
      prompt
    );
    return JSON.parse(result) as QualityCheckResult;
  }

  /**
   * Stream a post generation token-by-token through the delimiter protocol.
   * Auto-falls back to the free model on credit/model errors, mirroring the
   * non-streaming chatJson() behavior.
   */
  async streamPost(
    params: GeneratePostParams & { recentPosts?: any[]; trendingTopics?: any[]; contentPillars?: string[] },
    onText: (delta: string) => void
  ): Promise<void> {
    const prompt = POST_GENERATION_STREAM_PROMPT(params);
    try {
      await this.streamChat(prompt, MODEL, onText);
    } catch (err: any) {
      const msg = String(err?.message || err);
      const status = err?.status;
      if (status === 402 || status === 404 || /insufficient credits/i.test(msg)) {
        await this.streamChat(prompt, FREE_FALLBACK_MODEL, onText);
      } else {
        throw err;
      }
    }
  }

  private async streamChat(
    prompt: string,
    model: string,
    onText: (delta: string) => void
  ): Promise<void> {
    const stream = await this.client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are the AI Growth Engine for LinkedIn content. Follow the OUTPUT FORMAT exactly." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8192,
      stream: true,
    } as any);

    for await (const chunk of stream as any) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) onText(delta);
    }
  }
}
