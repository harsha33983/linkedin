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

const MODEL = process.env.AI_MODEL || "deepseek-ai/DeepSeek-V4-Flash";
const BASE_URL = process.env.AI_BASE_URL || "https://kiosapi.com/v1";
const API_KEY = process.env.NEW_API_KEY || process.env.AI_API_KEY || "";

/**
 * Kimi K3 Provider
 *
 * Uses kiosapi.com endpoint with moonshotai/kimi-k3 model.
 * Best for: main post generation, voice analysis, rewrite, ideas
 */
export class KimiProvider implements AIProvider {
  name = "deepseek-v4";
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      baseURL: BASE_URL,
      apiKey: API_KEY,
    });
  }

  private async chat(
    systemPrompt: string,
    userPrompt: string,
    responseFormat?: "json"
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 8192,
      });

      return response.choices[0]?.message?.content || "";
    } catch (kimiError: any) {
      // DeepSeek not available — fall back to Groq
      console.warn("[DeepSeek] Model not available, falling back to Groq:", kimiError?.message || kimiError);
      const { GroqProvider } = require("./groq-provider");
      const groq = new GroqProvider();
      return (groq as any).chat(systemPrompt, userPrompt, responseFormat);
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
    const result = await this.chat(
      "You are an expert at analyzing writing styles and voice. Always respond with valid JSON.",
      prompt,
      "json"
    );
    return JSON.parse(result) as VoiceAnalysisResult;
  }

  async generatePost(params: GeneratePostParams): Promise<GeneratePostResult> {
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
}
