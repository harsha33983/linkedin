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

const MODEL = process.env.AI_MODEL || "moonshotai/kimi-k3";
const BASE_URL = process.env.AI_BASE_URL || "https://kiosapi.com/v1";
const API_KEY = process.env.NEW_API_KEY || process.env.OPENAI_API_KEY || "";

export class OpenAIProvider implements AIProvider {
  name = "openai";
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
    const response = await this.client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(responseFormat === "json"
        ? { response_format: { type: "json_object" } }
        : {}),
      temperature: 0.7,
      max_tokens: 4096,
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

  async generatePost(params: GeneratePostParams): Promise<GeneratePostResult> {
    const prompt = POST_GENERATION_PROMPT(params);
    const result = await this.chat(
      "You are an expert LinkedIn content creator who writes in the user's exact voice. Always respond with valid JSON.",
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
