/**
 * Generic JSON chat with provider failover.
 *
 * The AIProvider classes expose typed feature methods (generateIdeas, etc.)
 * but no public raw-chat surface. This module provides the raw OpenAI-compatible
 * chat call — Groq first (AI_PROVIDER), OpenRouter second — for the originality
 * pipeline and other JSON tasks. Keys come from env only; nothing is hard-coded
 * and nothing reaches the client.
 */

const TIMEOUT_MS = Number(process.env.AI_CHAT_TIMEOUT_MS || 45_000);

interface Endpoint {
  name: string;
  url: string;
  key: string | undefined;
  model: string;
  extraHeaders?: Record<string, string>;
}

function endpoints(): Endpoint[] {
  const list: Endpoint[] = [];
  const groqModel = process.env.AI_MODEL || "openai/gpt-oss-120b";
  const groq: Endpoint = {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: process.env.GROQ_API_KEY,
    model: groqModel,
  };
  const openrouter: Endpoint = {
    name: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free",
    extraHeaders: {
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3001",
      "X-Title": "LinkedGrow AI",
    },
  };

  const primary = (process.env.AI_PROVIDER || "groq").toLowerCase();
  if (primary === "openrouter") {
    list.push(openrouter, groq);
  } else {
    list.push(groq, openrouter);
  }
  return list.filter((e) => Boolean(e.key));
}

function extractJson(raw: string): string {
  const cleaned = raw.replace(/```json/gi, "```").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return cleaned.trim();
  return cleaned.slice(start, end + 1);
}

export interface ChatJsonResult {
  data: unknown;
  provider: string;
}

/**
 * Run a system+user prompt against the configured providers in order.
 * Returns the parsed JSON plus the provider that answered.
 * Throws when every configured provider fails.
 */
export async function chatJson(
  systemPrompt: string,
  userPrompt: string
): Promise<ChatJsonResult> {
  const list = endpoints();
  if (list.length === 0) throw new Error("no AI provider keys configured");

  let lastError = "unknown";
  for (const ep of list) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ep.key}`,
          "Content-Type": "application/json",
          ...(ep.extraHeaders || {}),
        },
        body: JSON.stringify({
          model: ep.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 4096,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        lastError = `${ep.name} HTTP ${res.status}`;
        continue;
      }
      const data = await res.json();
      const content: string = data?.choices?.[0]?.message?.content || "";
      if (!content) {
        lastError = `${ep.name} empty content`;
        continue;
      }
      return { data: JSON.parse(extractJson(content)), provider: ep.name };
    } catch (err: any) {
      lastError = `${ep.name}: ${String(err?.message || err).slice(0, 120)}`;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`All AI providers failed (${lastError})`);
}
