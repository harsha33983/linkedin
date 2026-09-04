"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Idea {
  id: string;
  title: string;
  description: string | null;
  topic: string | null;
  format: string | null;
  status: string;
  suggestionReason: string | null;
  createdAt: string;
}

const FORMAT_COLORS: Record<string, string> = {
  Educational: "bg-blue-100 text-blue-800",
  "Personal story": "bg-pink-100 text-pink-800",
  Contrarian: "bg-red-100 text-red-800",
  Opinion: "bg-amber-100 text-amber-800",
  Listicle: "bg-teal-100 text-teal-800",
  Framework: "bg-indigo-100 text-indigo-800",
  "Case study": "bg-emerald-100 text-emerald-800",
  "Lesson learned": "bg-purple-100 text-purple-800",
  Announcement: "bg-cyan-100 text-cyan-800",
  Promotional: "bg-orange-100 text-orange-800",
};

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [tab, setTab] = useState<"active" | "dismissed">("active");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchIdeas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ideas?status=${tab}`);
      const data = await res.json();
      if (data.success) setIdeas(data.data);
    } catch (err) {
      console.error("Failed to fetch ideas:", err);
      setError("Failed to load ideas.");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  const generateIdeas = async () => {
    setGenerating(true);
    setMessage("");
    setError("");
    try {
      // 1. Ask the AI (or rule-based fallback) for a fresh batch.
      const genRes = await fetch("/api/ai/generate-ideas", { method: "POST" });
      const genData = await genRes.json();
      if (!genData.success || !genData.data?.ideas?.length) {
        setError(genData.error || "Idea generation failed. Please try again.");
        return;
      }

      // 2. Persist the batch to the idea library (duplicates auto-skipped).
      const saveRes = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideas: genData.data.ideas }),
      });
      const saveData = await saveRes.json();
      if (!saveData.success) {
        setError(saveData.error || "Failed to save ideas.");
        return;
      }

      setMessage(saveData.message || "Ideas generated.");
      fetchIdeas();
    } catch (err) {
      console.error("Idea generation failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const setIdeaStatus = async (id: string, status: "active" | "dismissed") => {
    try {
      await fetch(`/api/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchIdeas();
    } catch (err) {
      console.error("Failed to update idea:", err);
      setError("Failed to update idea.");
    }
  };

  const deleteIdea = async (id: string) => {
    if (!confirm("Delete this idea?")) return;
    try {
      await fetch(`/api/ideas/${id}`, { method: "DELETE" });
      fetchIdeas();
    } catch (err) {
      console.error("Failed to delete idea:", err);
      setError("Failed to delete idea.");
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Content Ideas</h1>
          <p className="text-gray-600 mt-1">
            Personalized ideas generated from your expertise, audience, and goals.
          </p>
        </div>
        <Button onClick={generateIdeas} disabled={generating} size="lg">
          {generating ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating ideas...
            </span>
          ) : (
            "✨ Generate Ideas"
          )}
        </Button>
      </div>

      {message && (
        <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded mb-4">
          {message}
        </div>
      )}
      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["active", "dismissed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
              tab === t
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-300 hover:border-gray-900"
            }`}
          >
            {t === "active" ? "Active" : "Dismissed"}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-gray-400 animate-pulse">Loading ideas...</div>
      ) : ideas.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            {tab === "active" ? (
              <>
                <p className="text-gray-600 mb-1">No ideas yet.</p>
                <p className="text-sm text-gray-400 mb-5">
                  Generate a batch personalized to your expertise — it takes a few seconds.
                </p>
                <Button onClick={generateIdeas} disabled={generating}>
                  {generating ? "Generating..." : "✨ Generate Ideas"}
                </Button>
              </>
            ) : (
              <p className="text-gray-500">
                No dismissed ideas. Ideas you dismiss will appear here if you change your mind.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => (
            <Card key={idea.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm">{idea.title}</h3>
                      {idea.format && (
                        <Badge className={FORMAT_COLORS[idea.format] || "bg-gray-100 text-gray-700"}>
                          {idea.format}
                        </Badge>
                      )}
                      {idea.topic && <Badge variant="secondary">{idea.topic}</Badge>}
                    </div>
                    {idea.description && (
                      <p className="text-sm text-gray-600 mt-1">{idea.description}</p>
                    )}
                    {idea.suggestionReason && (
                      <p className="text-xs text-gray-400 mt-2 italic">{idea.suggestionReason}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(idea.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {tab === "active" && (
                      <Link
                        href={`/create/ai-post?topic=${encodeURIComponent(idea.title)}`}
                        passHref
                      >
                        <Button size="sm">Draft post</Button>
                      </Link>
                    )}
                    {tab === "active" ? (
                      <Button size="sm" variant="ghost" onClick={() => setIdeaStatus(idea.id, "dismissed")}>
                        Dismiss
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setIdeaStatus(idea.id, "active")}>
                        Restore
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500"
                      onClick={() => deleteIdea(idea.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
