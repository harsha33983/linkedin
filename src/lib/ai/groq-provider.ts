import Groq from "groq-sdk";
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

const MODEL = process.env.AI_MODEL || "openai/gpt-oss-120b";
const GROQ_FALLBACK_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

export class GroqProvider implements AIProvider {
  name = "groq";
  private client: Groq;

  constructor() {
    this.client = new Groq({
      // The Groq SDK throws at construction if the key is undefined — use a
      // placeholder so a missing key fails at request time (401) instead,
      // letting the provider-failover layer handle it gracefully.
      apiKey: process.env.GROQ_API_KEY || "missing-groq-api-key",
    });
  }

  private async chat(
    systemPrompt: string,
    userPrompt: string,
    responseFormat?: "json"
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      ...(responseFormat === "json"
        ? { response_format: { type: "json_object" } }
        : {}),
    });

    return response.choices[0]?.message?.content || "";
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
    const result = await this.chat(
      "You are an expert at analyzing writing styles and voice. Always respond with valid JSON.",
      prompt,
      "json"
    );
    return JSON.parse(result) as VoiceAnalysisResult;
  }

  async generatePost(params: GeneratePostParams & { recentPosts?: any[]; trendingTopics?: any[]; contentPillars?: string[] }): Promise<GeneratePostResult> {
    const prompt = POST_GENERATION_PROMPT(params);
    const result = await this.chat(
      "You are the AI Growth Engine for LinkedIn content. You analyze performance data, find content opportunities, and generate posts that match the user's exact Voice DNA. Always respond with valid JSON.",
      prompt,
      "json"
    );
    return JSON.parse(result) as GeneratePostResult;
  }

  async generateHooks(
    params: GenerateHookParams
  ): Promise<GenerateHookResult> {
    const prompt = HOOK_GENERATION_PROMPT(params);
    const result = await this.chat(
      "You are an expert at crafting compelling LinkedIn hooks. Always respond with valid JSON.",
      prompt,
      "json"
    );
    return JSON.parse(result) as GenerateHookResult;
  }

  async generateIdeas(
    params: GenerateIdeaParams
  ): Promise<GenerateIdeaResult> {
    const prompt = IDEA_GENERATION_PROMPT(params);
    const result = await this.chat(
      "You are an expert at generating personalized LinkedIn content ideas. Always respond with valid JSON.",
      prompt,
      "json"
    );
    return JSON.parse(result) as GenerateIdeaResult;
  }

  async rewriteContent(params: RewriteParams): Promise<RewriteResult> {
    const prompt = REWRITE_PROMPT(params);
    const result = await this.chat(
      "You are an expert at rewriting content to match a specific voice. Always respond with valid JSON.",
      prompt,
      "json"
    );
    return JSON.parse(result) as RewriteResult;
  }

  async checkQuality(
    content: string,
    voiceProfile: VoiceProfile,
    recentHooks: string[]
  ): Promise<QualityCheckResult> {
    const prompt = QUALITY_CHECK_PROMPT(content, voiceProfile, recentHooks);
    const result = await this.chat(
      "You are a content quality reviewer. Check for fabrication, invented anecdotes, and hook repetition. Always respond with valid JSON.",
      prompt,
      "json"
    );
    return JSON.parse(result) as QualityCheckResult;
  }

  /**
   * Stream a post generation token-by-token through the delimiter protocol
   * (see post-generation-stream.ts). Falls back through the model list if the
   * primary model errors — same resilience as chat().
   */
  async streamPost(
    params: GeneratePostParams & { recentPosts?: any[]; trendingTopics?: any[]; contentPillars?: string[]; styleContext?: any },
    onText: (delta: string) => void
  ): Promise<void> {
    const prompt = POST_GENERATION_STREAM_PROMPT(params);
    const models = [MODEL, ...(GROQ_FALLBACK_MODELS.filter((m) => m !== MODEL))];
    let lastError: any;

    for (const model of models) {
      try {
        const stream = await this.client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: "You are the AI Growth Engine for LinkedIn content. Follow the OUTPUT FORMAT exactly." },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 4096,
          stream: true,
        } as any);

        for await (const chunk of stream as any) {
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (delta) onText(delta);
        }
        return; // success
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err);
        // Model-specific failures (decommissioned/blocked) → try next model.
        // Auth/quota failures won't fix themselves on another model.
        if (err?.status === 401 || err?.status === 429 || /quota|billing/i.test(msg)) throw err;
        console.warn(`[Groq] streamPost model "${model}" failed, trying next:`, msg.slice(0, 120));
      }
    }
    throw lastError;
  }
}
