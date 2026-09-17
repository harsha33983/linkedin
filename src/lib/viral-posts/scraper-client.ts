/**
 * Internal client for the Python Scrapling scraper service.
 *
 * The service is internal-only: SCRAPER_INTERNAL_TOKEN travels server →
 * service, never to the browser. Mock mode (SCRAPER_SERVICE_MODE=mock) makes
 * NO network call at all — the deterministic mock dataset is generated
 * locally so the whole feature works without the Python service running.
 */

import { normalizeViralPost, type RawViralPost, type ViralPost } from "./types";
import { calculateViralScore } from "./viral-score";

export interface ScraperSearchParams {
  keyword: string;
  days: number;
  limit: number;
}

export interface ScraperSearchResult {
  posts: ViralPost[];
  status: "ok" | "mock" | "temporarily_unavailable";
  mode: string;
  found: number;
  extracted: number;
  failed: number;
}

const SERVICE_URL = process.env.SCRAPER_SERVICE_URL || "http://127.0.0.1:8100";
const INTERNAL_TOKEN = process.env.SCRAPER_INTERNAL_TOKEN || "";
const MODE = (process.env.SCRAPER_MODE || process.env.SCRAPER_SERVICE_MODE || "mock").toLowerCase();
const TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 60_000);

/** Deterministic local mock (SCRAPER_MODE=mock) — no external requests. */
function localMock({ keyword, days, limit }: ScraperSearchParams): ScraperSearchResult {
  // Simple deterministic generator shared with the Python mock's spirit:
  // stable per keyword, varied engagement, recent dates.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require("crypto") as typeof import("crypto");
  const seed = createHash("sha256").update(keyword.toLowerCase()).digest();
  let si = 0;
  const next = (mod: number) => {
    si = (si + 1) % seed.length;
    return seed[si] % mod;
  };

  const names = [
    ["Priya Raman", "Founder @ Northbeam Labs"],
    ["Marcus Webb", "Engineering Manager"],
    ["Aisha Bello", "Head of Growth"],
    ["Daniel Kowalski", "Career Coach"],
    ["Elena Suarez", "Fractional CMO"],
    ["Tom Okafor", "ML Engineer"],
    ["Sara Lindqvist", "Product Designer"],
    ["James Carter", "Startup Advisor"],
  ];
  const pool: Record<string, string[]> = {
    ai: [
      "We replaced our onboarding docs with an AI assistant. Support tickets dropped faster than anyone predicted. Here is the honest breakdown of what worked.",
      "Everyone is adding AI features. Almost nobody is asking users first. After 6 months of shipping, I finally understand why discovery matters more than the model.",
      "I asked our AI to review 1,000 support conversations. The top insight had nothing to do with the product — it was about response time expectations.",
    ],
    saas: [
      "Our churn went down 40% in one quarter. Not because of a new feature — we simply asked canceling users one better question.",
      "Pricing pages are conversations, not tables. We tested three structures and the winner surprised us completely.",
      "The best SaaS onboarding advice I ever got: show value before asking for a single preference setting.",
    ],
    default: [
      "Consistency beats intensity in everything I have tried professionally. This is the system that finally made it stick for me.",
      "The most underrated professional skill: writing clearly under time pressure. Here is how I practice it weekly.",
      "I spent a year saying yes to everything. Then I tracked my calendar for a month and the data changed my mind completely.",
    ],
  };
  const key = Object.keys(pool).find((k) => keyword.toLowerCase().includes(k)) || "default";
  const topic = key === "default" ? keyword.toLowerCase() : key;

  const posts: ViralPost[] = [];
  const count = Math.min(limit, 30);
  for (let i = 0; i < count; i++) {
    const [name, headline] = names[(i + next(names.length)) % names.length];
    const slug = `${name.toLowerCase().replace(/\s+/g, "-")}-${seed.toString("hex").slice(0, 8)}${i}`;
    const reactions = [120, 340, 850, 1500, 2300, 4100, 6800, 9400][next(8)];
    const comments = Math.round(reactions * (0.03 + next(20) / 100));
    const reposts = Math.round(reactions * (0.01 + next(12) / 100));
    const content = pool[key][i % pool[key].length];
    const daysAgo = 1 + next(13);
    const publishedAt = new Date(Date.now() - daysAgo * 86_400_000 - next(20) * 3_600_000).toISOString();
    const raw: RawViralPost = {
      sourceUrl: `https://www.linkedin.com/posts/${slug}`,
      postId: `urn:li:mock:${seed.toString("hex").slice(0, 12)}-${i}`,
      author: {
        name,
        headline,
        profileUrl: `https://www.linkedin.com/in/${slug}`,
        avatarUrl: null,
      },
      content,
      publishedAt,
      reactions,
      comments,
      reposts,
      mediaUrl: null,
      mediaType: null,
      hashtags: [`#${topic.charAt(0).toUpperCase() + topic.slice(1)}`, "#Growth", "#LessonsLearned"].slice(0, 2 + next(2)),
      topics: [topic],
    };
    const post = normalizeViralPost(raw);
    post.viralScore = calculateViralScore(post);
    posts.push(post);
  }

  posts.sort((a, b) => b.viralScore - a.viralScore);
  return {
    posts: posts.slice(0, limit),
    status: "mock",
    mode: "mock",
    found: posts.length,
    extracted: posts.length,
    failed: 0,
  };
}

async function callService<T>(path: string, body: unknown): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${SERVICE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INTERNAL_TOKEN ? { "X-Internal-Token": INTERNAL_TOKEN } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function scrapeSearch(params: ScraperSearchParams): Promise<ScraperSearchResult> {
  // Mock mode short-circuits: zero external requests, fully deterministic.
  if (MODE === "mock") return localMock(params);

  type ServicePost = RawViralPost & { viralScore?: number };
  const raw = await callService<{
    posts: ServicePost[];
    status: string;
    mode: string;
    found: number;
    extracted: number;
    failed: number;
  }>("/scrape/linkedin/search", {
    keyword: params.keyword,
    days: params.days,
    limit: params.limit,
  });

  if (!raw || !Array.isArray(raw.posts)) {
    return { posts: [], status: "temporarily_unavailable", mode: MODE, found: 0, extracted: 0, failed: 0 };
  }

  const posts = raw.posts.map((p) => {
    const post = normalizeViralPost(p);
    post.viralScore =
      typeof p.viralScore === "number" ? p.viralScore : calculateViralScore(post);
    return post;
  });
  posts.sort((a, b) => b.viralScore - a.viralScore);

  return {
    posts,
    status: raw.status === "temporarily_unavailable" ? "temporarily_unavailable" : "ok",
    mode: raw.mode || MODE,
    found: raw.found ?? posts.length,
    extracted: raw.extracted ?? posts.length,
    failed: raw.failed ?? 0,
  };
}

export function scraperMode(): string {
  return MODE;
}
