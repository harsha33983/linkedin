/**
 * Viral Posts — types, normalization, post identity.
 *
 * A "viral post" is a PUBLIC LinkedIn post discovered through web search and
 * extracted by the scraper service. Ranking is OUR viralScore, and the
 * product surface is worded "Trending LinkedIn Posts" — never "all posts".
 */

export interface ViralPostAuthor {
  name: string | null;
  headline: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
}

export interface ViralPost {
  id: string;
  source: string;
  sourcePostId: string | null;
  sourceUrl: string;
  author: ViralPostAuthor;
  content: string | null;
  publishedAt: string | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  mediaUrl: string | null;
  mediaType: string | null;
  hashtags: string[];
  topics: string[];
  viralScore: number;
  keyword: string | null;
  fetchedAt: string | null;
}

/** Raw row from the scraper service / mock provider. */
export interface RawViralPost {
  sourceUrl?: string | null;
  postId?: string | null;
  author?: {
    name?: string | null;
    headline?: string | null;
    profileUrl?: string | null;
    avatarUrl?: string | null;
  } | null;
  content?: string | null;
  publishedAt?: string | null;
  reactions?: number | null;
  comments?: number | null;
  reposts?: number | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  hashtags?: string[] | null;
  topics?: string[] | null;
  viralScore?: number | null;
}

/**
 * Normalize a public LinkedIn post URL for identity purposes: lowercase host,
 * strip query/hash/trailing slash. The activity-id segment is kept (it is the
 * stable part of a post permalink).
 */
export function normalizePostUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    let path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${url.hostname}${path}`;
  } catch {
    return raw.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

/** Stable post id: provider id when present, else sha256 of normalized URL. */
export function postIdentity(
  source: string,
  sourcePostId: string | null | undefined,
  sourceUrl: string
): { sourcePostId: string | null; identity: string } {
  if (sourcePostId && sourcePostId.trim()) {
    return { sourcePostId: sourcePostId.trim(), identity: sourcePostId.trim() };
  }
  // Deterministic hash of the normalized URL (Node crypto, server-side).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require("crypto") as typeof import("crypto");
  const hash = createHash("sha256").update(normalizePostUrl(sourceUrl)).digest("hex").slice(0, 40);
  return { sourcePostId: `urlhash:${hash}`, identity: `urlhash:${hash}` };
}

/** Coerce any scraper output into the strict ViralPost shape (nulls kept). */
export function normalizeViralPost(raw: RawViralPost, source = "linkedin"): ViralPost {
  const sourceUrl = raw.sourceUrl || "";
  const { sourcePostId } = postIdentity(source, raw.postId ?? null, sourceUrl);
  const a = raw.author || {};
  return {
    id: "", // assigned on insert (gen_random_uuid()); identity is (source, sourcePostId)
    source,
    sourcePostId,
    sourceUrl,
    author: {
      name: a.name ?? null,
      headline: a.headline ?? null,
      profileUrl: a.profileUrl ?? null,
      avatarUrl: a.avatarUrl ?? null,
    },
    content: raw.content ?? null,
    publishedAt: raw.publishedAt ?? null,
    reactions: toIntOrNull(raw.reactions),
    comments: toIntOrNull(raw.comments),
    reposts: toIntOrNull(raw.reposts),
    mediaUrl: raw.mediaUrl ?? null,
    mediaType: raw.mediaType ?? null,
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.filter(Boolean).map(String) : [],
    topics: Array.isArray(raw.topics) ? raw.topics.filter(Boolean).map(String) : [],
    viralScore: typeof raw.viralScore === "number" ? raw.viralScore : 0,
    keyword: null,
    fetchedAt: null,
  };
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseInt(v.replace(/,/g, "").trim(), 10) : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

/** Parse publishedAt tolerantly (ISO or human) → ISO string or null. */
export function parsePublishedAt(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
