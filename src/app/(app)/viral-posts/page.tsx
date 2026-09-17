"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────

interface ViralPostCard {
  id: string;
  sourceUrl: string;
  author: { name: string | null; headline: string | null; profileUrl: string | null; avatarUrl: string | null };
  content: string | null;
  publishedAt: string | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  hashtags: string[];
  viralScore: number;
}

interface PostAnalysis {
  whyItWorks: string[];
  hookPattern: string;
  contentStructure: string;
  audience: string;
  emotionalTrigger: string;
  engagementMechanism: string;
  topic: string;
  format: string;
}

interface OriginalIdea {
  title: string;
  hook: string;
  angle: string;
  format: string;
  outline: string[];
  whyItCouldWork: string;
  cta: string;
}

interface ApiResponse {
  success: boolean;
  data: ViralPostCard[];
  total: number;
  status: string;
  notice: string | null;
  cache: { fetchedAt: string | null; expiresAt: string | null; staleServed: boolean };
}

// ─── Filter presets ───────────────────────────────────────────────

const AUTHOR_FILTERS = ["AI", "SaaS", "Marketing", "Startups", "Career", "Leadership", "Productivity"] as const;
const REACTION_FILTERS = [
  { label: "Any reactions", value: 0 },
  { label: "500+", value: 500 },
  { label: "1,000+", value: 1000 },
  { label: "5,000+", value: 5000 },
];
const DATE_FILTERS = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 14 days", value: 14 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function scoreColor(score: number): string {
  if (score >= 75) return "bg-green-100 text-green-800";
  if (score >= 50) return "bg-blue-100 text-blue-800";
  if (score >= 25) return "bg-yellow-100 text-yellow-800";
  return "bg-gray-100 text-gray-600";
}

// ─── Page ─────────────────────────────────────────────────────────

export default function ViralPostsPage() {
  const [keyword, setKeyword] = useState("AI");
  const [activeKeyword, setActiveKeyword] = useState("AI");
  const [authorFilter, setAuthorFilter] = useState<string>("AI");
  const [reactionsMin, setReactionsMin] = useState(0);
  const [days, setDays] = useState(14);
  const [sort, setSort] = useState<"viral" | "recent" | "reactions">("viral");
  const [page, setPage] = useState(1);

  const [posts, setPosts] = useState<ViralPostCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<string>("ok");
  const [cacheInfo, setCacheInfo] = useState<ApiResponse["cache"] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Use-this-post modal state
  const [selected, setSelected] = useState<ViralPostCard | null>(null);
  const [analysis, setAnalysis] = useState<PostAnalysis | null>(null);
  const [ideas, setIdeas] = useState<OriginalIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasError, setIdeasError] = useState("");
  const [savedIdeas, setSavedIdeas] = useState<Set<number>>(new Set());

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        keyword: activeKeyword,
        days: String(days),
        reactionsMin: String(reactionsMin),
        sort,
        page: String(page),
        limit: "12",
      });
      const res = await fetch(`/api/viral-posts?${params}`);
      const data: ApiResponse = await res.json();
      if (data.success) {
        setPosts(data.data || []);
        setTotal(data.total || 0);
        setCacheInfo(data.cache);
        setApiStatus(data.status || "ok");
      }
    } catch {
      // The friendly empty-state card already covers failures — no banner.
    } finally {
      setLoading(false);
    }
  }, [activeKeyword, days, reactionsMin, sort, page]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const applyKeyword = (kw: string) => {
    setKeyword(kw);
    setActiveKeyword(kw || "AI");
    setAuthorFilter(kw || "AI");
    setPage(1);
  };

  const forceRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/viral-posts/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: activeKeyword, days }),
      });
      await fetchPosts();
    } finally {
      setRefreshing(false);
    }
  };

  // ── Use this post → analysis + 5 original ideas ─────────────────
  const openAnalysis = async (post: ViralPostCard) => {
    setSelected(post);
    setAnalysis(null);
    setIdeas([]);
    setIdeasError("");
    setSavedIdeas(new Set());
    setIdeasLoading(true);
    try {
      const res = await fetch("/api/content-ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      });
      const data = await res.json();
      if (data.success) {
        setAnalysis(data.data.analysis);
        setIdeas(data.data.ideas || []);
      } else {
        setIdeasError(data.error || "Analysis failed. Please try again.");
      }
    } catch {
      setIdeasError("Something went wrong. Please try again.");
    } finally {
      setIdeasLoading(false);
    }
  };

  const regenerate = () => {
    if (selected) openAnalysis(selected);
  };

  const saveIdea = async (idea: OriginalIdea) => {
    try {
      await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideas: [
            {
              title: idea.title,
              description: idea.angle,
              topic: analysis?.topic || activeKeyword,
              format: idea.format,
              suggestionReason: idea.whyItCouldWork,
            },
          ],
        }),
      });
      setSavedIdeas((prev) => new Set(prev).add(ideas.indexOf(idea)));
    } catch {
      /* the idea stays usable even if saving fails */
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 12));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            🔥 Trending LinkedIn Posts
          </h1>
          <p className="text-gray-600 mt-1 text-sm">
            Publicly discoverable LinkedIn posts, ranked by our viral score.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cacheInfo?.fetchedAt && (
            <span className="text-xs text-gray-400">
              data from {new Date(cacheInfo.fetchedAt).toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={forceRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex-1 flex gap-2">
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyKeyword(keyword)}
                placeholder="Search topic (e.g. AI, SaaS, hiring…)"
              />
              <Button onClick={() => applyKeyword(keyword)} disabled={!keyword.trim()}>
                Search
              </Button>
            </div>
            <select
              className="border rounded-md px-3 py-2 text-sm bg-white"
              value={reactionsMin}
              onChange={(e) => {
                setReactionsMin(Number(e.target.value));
                setPage(1);
              }}
            >
              {REACTION_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              className="border rounded-md px-3 py-2 text-sm bg-white"
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value));
                setPage(1);
              }}
            >
              {DATE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              className="border rounded-md px-3 py-2 text-sm bg-white"
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
            >
              <option value="viral">Sort: Viral score</option>
              <option value="recent">Sort: Most recent</option>
              <option value="reactions">Sort: Reactions</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {AUTHOR_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => applyKeyword(f)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  authorFilter === f
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main grid: posts + side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Post cards */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <div className="animate-pulse text-gray-400 py-8 text-center">Loading trending posts…</div>
          ) : posts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                {apiStatus === "temporarily_unavailable" ? (
                  <>
                    <p className="font-medium text-gray-600 mb-1">
                      Trending search is warming up — try again in a few minutes.
                    </p>
                    <p className="text-sm">
                      Public search engines are rate-limiting us right now, so new
                      topics can&apos;t be fetched this moment. Cached topics from the
                      chips below still work instantly.
                    </p>
                  </>
                ) : (
                  <>
                    No trending posts found for this filter combination yet. Try a
                    broader keyword or fewer reaction filters.
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            posts.map((post) => (
              <Card key={post.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    {post.author.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.author.avatarUrl}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                        {(post.author.name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{post.author.name || "Unknown author"}</p>
                      <p className="text-xs text-gray-500 truncate">{post.author.headline || ""}</p>
                      <p className="text-xs text-gray-400">{timeAgo(post.publishedAt)}</p>
                    </div>
                    <div className="text-right">
                      <Badge className={scoreColor(post.viralScore)}>
                        🔥 {Math.round(post.viralScore)}
                      </Badge>
                      <p className="text-[10px] text-gray-400 mt-1">viral score</p>
                    </div>
                  </div>

                  {post.content && (
                    <p className="text-sm text-gray-700 whitespace-pre-line line-clamp-4 mb-3">
                      {post.content}
                    </p>
                  )}

                  {post.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {post.hashtags.slice(0, 5).map((t) => (
                        <span key={t} className="text-xs text-blue-700">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>👍 {(post.reactions ?? 0).toLocaleString()}</span>
                      <span>💬 {(post.comments ?? 0).toLocaleString()}</span>
                      <span>🔁 {(post.reposts ?? 0).toLocaleString()}</span>
                    </div>
                    <Button size="sm" onClick={() => openAnalysis(post)}>
                      Use this post ↗
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ← Prev
              </Button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next →
              </Button>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-lg mb-2">
                Get <span className="text-blue-600">smart</span> and{" "}
                <span className="text-blue-600">100% original</span> content ideas
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Pick a trending post — we analyze the pattern behind its
                performance and turn it into 5 original ideas that fit YOUR
                expertise and audience. We never copy the source post.
              </p>
              <ul className="text-sm space-y-2 text-gray-700">
                <li>✓ Pattern analysis, not plagiarism</li>
                <li>✓ Adapted to your Voice DNA profile</li>
                <li>✓ One click to save ideas to your library</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold mb-2 text-sm text-gray-500">ABOUT THIS DATA</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Posts are discovered through public web search and extracted
                from publicly accessible LinkedIn pages only. Metrics reflect
                what was publicly visible when the post was fetched. Ranking is
                LinkedGrow&apos;s own viral score — not LinkedIn&apos;s.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Analysis + original ideas modal ─────────────────────── */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto p-4 md:p-8"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-xl max-w-3xl w-full p-6 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Post Analysis</h2>
                <p className="text-sm text-gray-500 mt-1">
                  by {selected.author.name || "Unknown"} · {timeAgo(selected.publishedAt)} ·{" "}
                  🔥 {Math.round(selected.viralScore)} viral score
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                ✕ Close
              </Button>
            </div>

            {ideasLoading ? (
              <div className="animate-pulse text-gray-400 py-10 text-center">
                Analyzing the post and generating original ideas…
              </div>
            ) : ideasError ? (
              <div className="p-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
                {ideasError}
              </div>
            ) : (
              <>
                {/* Analysis */}
                {analysis && (
                  <div className="space-y-3">
                    <h3 className="font-semibold">Why this post is performing well</h3>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                      {analysis.whyItWorks.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {[
                        ["Hook pattern", analysis.hookPattern],
                        ["Content structure", analysis.contentStructure],
                        ["Audience", analysis.audience],
                        ["Emotional trigger", analysis.emotionalTrigger],
                        ["Engagement mechanism", analysis.engagementMechanism],
                        ["Topic", analysis.topic],
                        ["Format", analysis.format],
                      ].map(([label, value]) => (
                        <div key={label as string} className="bg-gray-50 rounded-md p-3">
                          <p className="text-xs uppercase text-gray-400 mb-1">{label}</p>
                          <p className="text-gray-800">{value || "—"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ideas */}
                {ideas.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">
                        5 Original Ideas <span className="text-xs font-normal text-gray-400">(adapted to your profile)</span>
                      </h3>
                      <Button variant="outline" size="sm" onClick={regenerate}>
                        ↻ Regenerate
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {ideas.map((idea) => {
                        const idx = ideas.indexOf(idea);
                        const saved = savedIdeas.has(idx);
                        return (
                          <Card key={idx}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-medium">{idea.title}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {idea.format}
                                  </p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                  <Link
                                    href={`/create/ai-post?topic=${encodeURIComponent(idea.title)}&format=${encodeURIComponent(idea.format)}`}
                                  >
                                    <Button size="sm">Use Idea</Button>
                                  </Link>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => saveIdea(idea)}
                                    disabled={saved}
                                  >
                                    {saved ? "✓ Saved" : "Save"}
                                  </Button>
                                </div>
                              </div>
                              <p className="text-sm text-gray-700 mt-2 italic">&ldquo;{idea.hook}&rdquo;</p>
                              <p className="text-xs text-gray-500 mt-2">{idea.angle}</p>
                              {idea.outline.length > 0 && (
                                <ol className="list-decimal pl-5 text-xs text-gray-600 mt-2 space-y-0.5">
                                  {idea.outline.map((o, i) => (
                                    <li key={i}>{o}</li>
                                  ))}
                                </ol>
                              )}
                              <p className="text-xs text-gray-500 mt-2">
                                <span className="font-medium">Why it could work:</span>{" "}
                                {idea.whyItCouldWork}
                              </p>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
