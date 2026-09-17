/**
 * Provider order resolution for the LLM router.
 *
 * Kept separate from llm-router.ts so tests can exercise routing without
 * touching the concrete provider modules.
 */

export type Complexity = "LOW" | "MEDIUM" | "HIGH";

/**
 * Primary provider name for this deployment. Defaults to "groq" (the only
 * provider with a proven working key) instead of the dead "kimi" default —
 * see the audit: kimi 403s every call, burning latency before failover.
 */
export function getPrimaryProviderName(): string {
  const p = (process.env.AI_PROVIDER || "groq").toLowerCase();
  // Guard against the legacy dead default: never let kimi be primary unless
  // an operator explicitly keeps it AND provides a key.
  if (p === "kimi" && !process.env.KIMI_API_KEY) return "groq";
  return p;
}

/** Ordered provider names to try for this complexity. */
export function getProviderOrder(complexity: Complexity): string[] {
  const primary = getPrimaryProviderName();
  const secondary = primary === "groq"
    ? (process.env.OPENROUTER_API_KEY ? "openrouter" : "openai")
    : "groq";

  if (complexity === "MEDIUM") {
    // Cheap-first: prefer the secondary for medium tasks when available.
    return secondary === "openai" && !process.env.OPENAI_API_KEY
      ? [primary]
      : [secondary, primary];
  }
  // HIGH → premium first.
  return [primary, secondary];
}
