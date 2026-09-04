"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QualityCheckResult {
  passes: boolean;
  fabricatedClaims: boolean;
  inventedAnecdotes: boolean;
  hookRepetition: boolean;
  details: string[];
}

export default function AnalyzePage() {
  const [content, setContent] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<QualityCheckResult | null>(null);
  const [error, setError] = useState("");

  const analyze = async () => {
    if (!content.trim()) return;
    setAnalyzing(true);
    setError("");

    try {
      const res = await fetch("/api/ai/analyze-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || "Analysis failed");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Post Analyzer</h1>
      <p className="text-gray-600 mb-8">
        Analyze an existing post for quality, voice-fit, and potential issues.
      </p>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded mb-6">{error}</div>
      )}

      <Card className="mb-8">
        <CardContent className="p-6">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste a LinkedIn post to analyze..."
            rows={10}
          />
          <div className="mt-4">
            <Button onClick={analyze} disabled={!content.trim() || analyzing}>
              {analyzing ? "Analyzing..." : "Analyze Post"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-6">
          {/* Overall Result */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Badge className={result.passes ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                  {result.passes ? "✓ Passed" : "⚠ Issues Found"}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className={`p-3 rounded-lg ${result.fabricatedClaims ? "bg-red-50" : "bg-green-50"}`}>
                  <p className="text-sm font-medium">Fabricated Claims</p>
                  <p className={`text-xs ${result.fabricatedClaims ? "text-red-600" : "text-green-600"}`}>
                    {result.fabricatedClaims ? "Potential issues detected" : "None detected"}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${result.inventedAnecdotes ? "bg-red-50" : "bg-green-50"}`}>
                  <p className="text-sm font-medium">Invented Anecdotes</p>
                  <p className={`text-xs ${result.inventedAnecdotes ? "text-red-600" : "text-green-600"}`}>
                    {result.inventedAnecdotes ? "Potential issues detected" : "None detected"}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${result.hookRepetition ? "bg-red-50" : "bg-green-50"}`}>
                  <p className="text-sm font-medium">Hook Repetition</p>
                  <p className={`text-xs ${result.hookRepetition ? "text-red-600" : "text-green-600"}`}>
                    {result.hookRepetition ? "Similar to recent hooks" : "Unique hook"}
                  </p>
                </div>
              </div>

              {/* Details */}
              <div>
                <h3 className="text-sm font-medium mb-2">Details</h3>
                <ul className="space-y-1">
                  {result.details.map((detail, i) => (
                    <li key={i} className="text-sm text-gray-600">
                      • {detail}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
