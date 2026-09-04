import type {
  VoiceProfile,
  UserProfile,
  PostFormat,
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
} from "@/types";

/**
 * Provider-agnostic AI interface.
 * Swap implementations by changing one env var — zero code changes downstream.
 */
export interface AIProvider {
  name: string;

  /**
   * Analyze writing samples and extract Voice DNA dimensions.
   */
  analyzeVoice(
    samples: string[],
    config: VoiceAnalysisConfig
  ): Promise<VoiceAnalysisResult>;

  /**
   * Generate 3 post versions using Voice DNA as a hard constraint.
   */
  generatePost(params: GeneratePostParams): Promise<GeneratePostResult>;

  /**
   * Generate hooks with structural + voice-fit scoring.
   */
  generateHooks(params: GenerateHookParams): Promise<GenerateHookResult>;

  /**
   * Generate personalized content ideas.
   */
  generateIdeas(params: GenerateIdeaParams): Promise<GenerateIdeaResult>;

  /**
   * Rewrite existing content with Voice DNA applied.
   */
  rewriteContent(params: RewriteParams): Promise<RewriteResult>;

  /**
   * Quality gate: check for fabrication, invented anecdotes, hook repetition.
   * Fail-closed: if a check fails, regenerate server-side before returning.
   */
  checkQuality(
    content: string,
    voiceProfile: VoiceProfile,
    recentHooks: string[]
  ): Promise<QualityCheckResult>;
}

/**
 * Get the primary AI provider based on environment configuration.
 * Options: groq, kimi, openai
 */
export function getProvider(): AIProvider {
  const providerName = process.env.AI_PROVIDER || "kimi";

  switch (providerName) {
    case "groq":
      const { GroqProvider } = require("./groq-provider");
      return new GroqProvider();
    case "kimi":
      const { KimiProvider } = require("./kimi-provider");
      return new KimiProvider();
    case "openai":
      const { OpenAIProvider } = require("./openai-provider");
      return new OpenAIProvider();
    default:
      throw new Error(`Unknown AI provider: ${providerName}`);
  }
}

/**
 * Get a secondary provider for fallback or specific tasks.
 * Returns Groq for fast tasks (quality checks, ideas) when primary is Kimi.
 */
export function getSecondaryProvider(): AIProvider {
  const primary = process.env.AI_PROVIDER || "kimi";
  
  if (primary === "kimi") {
    // Use Groq for fast fallback tasks
    const { GroqProvider } = require("./groq-provider");
    return new GroqProvider();
  }
  
  // Default fallback to Kimi for tasks needing more capability
  const { KimiProvider } = require("./kimi-provider");
  return new KimiProvider();
}
