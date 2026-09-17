/**
 * Provider registry — named lookup for the LLM router.
 *
 * The router works with provider *names*; this resolves them to AIProvider
 * instances. Providers are constructed lazily so a broken/missing key on one
 * provider never blocks the others.
 */

import type { AIProvider } from "./types";

export function getProviderByName(name: string): AIProvider | null {
  try {
    switch ((name || "").toLowerCase()) {
      case "groq": {
        if (!process.env.GROQ_API_KEY) return null;
        const { GroqProvider } = require("./groq-provider");
        return new GroqProvider();
      }
      case "openrouter": {
        if (!process.env.OPENROUTER_API_KEY) return null;
        const { OpenRouterProvider } = require("./openrouter-provider");
        return new OpenRouterProvider();
      }
      case "openai": {
        if (!process.env.OPENAI_API_KEY) return null;
        const { OpenAIProvider } = require("./openai-provider");
        return new OpenAIProvider();
      }
      case "kimi": {
        if (!process.env.KIMI_API_KEY) return null;
        const { KimiProvider } = require("./kimi-provider");
        return new KimiProvider();
      }
      default:
        return null;
    }
  } catch (err: any) {
    console.warn(`[provider-registry] "${name}" init failed:`, String(err?.message || err).slice(0, 120));
    return null;
  }
}
