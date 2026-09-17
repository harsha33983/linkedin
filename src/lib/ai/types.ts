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

  /**
   * Optional streaming post generation: delivers the raw model output
   * token-by-token via onText as it arrives (delimiter protocol, see
   * post-generation-stream.ts). Providers that don't support streaming
   * simply omit this — the route falls back to the buffered path.
   */
  streamPost?(
    params: GeneratePostParams & { recentPosts?: any[]; trendingTopics?: any[]; contentPillars?: string[] },
    onText: (delta: string) => void
  ): Promise<void>;
}

/**
 * Get the primary AI provider based on environment configuration.
 * Options: groq, kimi, openai, openrouter
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
    case "openrouter":
      const { OpenRouterProvider } = require("./openrouter-provider");
      return new OpenRouterProvider();
    default:
      throw new Error(`Unknown AI provider: ${providerName}`);
  }
}

/**
 * Run an AI operation on the primary provider, automatically retrying on the
 * secondary provider if the primary throws or returns a unusable result.
 *
 * This is the app-wide failover layer: if the configured AI_PROVIDER is down,
 * rate-limited, or misbehaving, generation transparently continues on the
 * secondary (normally Groq ⇄ OpenRouter) instead of erroring to the user.
 */
export async function withFailover<T>(
  op: (provider: AIProvider) => Promise<T>,
  isUsable: (result: T) => boolean = () => true
): Promise<{ result: T; provider: string }> {
  // Construction and the call both sit inside try: a provider whose SDK
  // throws on a missing/invalid key must still allow failover to proceed.
  let primary: AIProvider;
  try {
    primary = getProvider();
  } catch (err: any) {
    console.warn(
      `[AI Failover] Primary "${process.env.AI_PROVIDER || "kimi"}" could not be initialized — falling back:`,
      String(err?.message || err).slice(0, 160)
    );
    const secondary = getSecondaryProvider();
    const result = await op(secondary);
    if (!isUsable(result)) {
      throw new Error(`AI generation failed on secondary provider (${secondary.name})`);
    }
    return { result, provider: secondary.name };
  }
  try {
    const result = await op(primary);
    if (isUsable(result)) return { result, provider: primary.name };
    console.warn(
      `[AI Failover] Primary "${primary.name}" returned an unusable result — retrying on secondary`
    );
  } catch (err: any) {
    console.warn(
      `[AI Failover] Primary "${primary.name}" failed — retrying on secondary:`,
      String(err?.message || err).slice(0, 160)
    );
  }

  const secondary = getSecondaryProvider();
  const result = await op(secondary);
  if (!isUsable(result)) {
    throw new Error(
      `AI generation failed on both primary (${primary.name}) and secondary (${secondary.name}) providers`
    );
  }
  return { result, provider: secondary.name };
}

/**
 * Get a secondary provider for fallback or specific tasks.
 * Groq is the universal fallback — it is the only provider with a proven,
 * working key (kimi/kiosapi returns 403 and openai has no key configured).
 */
export function getSecondaryProvider(): AIProvider {
  const primary = process.env.AI_PROVIDER || "kimi";

  if (primary !== "groq") {
    // Any non-Groq primary falls back to Groq
    const { GroqProvider } = require("./groq-provider");
    return new GroqProvider();
  }

  // Groq primary → try OpenRouter next (free models need no credits)
  if (process.env.OPENROUTER_API_KEY) {
    const { OpenRouterProvider } = require("./openrouter-provider");
    return new OpenRouterProvider();
  }

  const { KimiProvider } = require("./kimi-provider");
  return new KimiProvider();
}
