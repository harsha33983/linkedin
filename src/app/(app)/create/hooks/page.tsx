"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Hook {
  id: string;
  text: string;
  type: string;
  scores: { structural: number; voiceFit: number };
  explanation: string;
}

interface HookResult {
  hooks: Hook[];
  metadata: { model: string; voiceDnaVersionUsed: number };
}

const HOOK_TYPES = [
  "All",
  "Contrarian",
  "Curiosity",
  "Story",
  "Mistake",
  "Question",
  "Data",
  "Personal",
  "Authority",
];

export default function HooksPage() {
  const [topic, setTopic] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [hookType, setHookType] = useState("All");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<HookResult | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const generate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/ai/generate-hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          targetAudience: targetAudience || undefined,
          hookType: hookType === "All" ? undefined : hookType,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || "Generation failed");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setGenerating(false);
    }
  };

  const copyHook = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage("Hook copied!");
  };

  const useHook = (hook: Hook) => {
    navigator.clipboard.writeText(hook.text);
    setMessage("Hook copied! Paste it into your post.");
  };

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Hook Generator</h1>
      <p className="text-gray-600 mb-8">
        Generate opening lines with structural + voice-fit scoring. Never claims
        predictive performance — scores only on explainable criteria.
      </p>

      {message && (
        <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded mb-6">
          {message}
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Input */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">
                Topic <span className="text-red-500">*</span>
              </label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What should the hook be about?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Target Audience
              </label>
              <Input
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g., Founders"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium mb-2">Hook Type</label>
            <div className="flex flex-wrap gap-2">
              {HOOK_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setHookType(type)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    hookType === type
                      ? "bg-gray-900 text-white border-gray-900"
                      : "border-gray-300 hover:border-gray-900"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <Button onClick={generate} disabled={!topic.trim() || generating}>
              {generating ? "Generating..." : "Generate Hooks"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generated Hooks */}
      {result && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Generated Hooks ({result.hooks.length})
          </h2>

          {result.hooks.map((hook) => (
            <Card key={hook.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-base font-medium mb-2">"{hook.text}"</p>
                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant="secondary">{hook.type}</Badge>
                      <span className="text-sm text-gray-500">
                        Structural: {hook.scores.structural}
                      </span>
                      <span className="text-sm text-gray-500">
                        Voice Fit: {hook.scores.voiceFit}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{hook.explanation}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => useHook(hook)}>
                      Use
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyHook(hook.text)}
                    >
                      Copy
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
