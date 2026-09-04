"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RewriteResult {
  rewritten: string;
  changes: string[];
  metadata: { model: string; voiceDnaVersionUsed: number };
}

export default function RewritePage() {
  const [content, setContent] = useState("");
  const [instructions, setInstructions] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const rewrite = async () => {
    if (!content.trim() || !instructions.trim()) return;
    setRewriting(true);
    setError("");

    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, instructions }),
      });

      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || "Rewrite failed");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setRewriting(false);
    }
  };

  const saveDraft = async () => {
    if (!result) return;
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: result.rewritten,
          status: "DRAFT",
          voiceDnaVersionUsed: result.metadata.voiceDnaVersionUsed,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("Rewrite saved as draft!");
      }
    } catch {
      setMessage("Failed to save draft");
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-2">Rewrite</h1>
      <p className="text-gray-600 mb-8">
        Rewrite existing content with your Voice DNA applied. Change length,
        tone, or format while preserving the core message.
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
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Original Content <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste the content you want to rewrite..."
                rows={8}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Rewrite Instructions <span className="text-red-500">*</span>
              </label>
              <Input
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder='e.g., "Make it shorter and more contrarian" or "More personal, add a question CTA"'
              />
            </div>
            <Button
              onClick={rewrite}
              disabled={!content.trim() || !instructions.trim() || rewriting}
            >
              {rewriting ? "Rewriting..." : "Rewrite with Voice DNA"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Original */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-gray-500">Original</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm text-gray-700">
                {content}
              </div>
            </CardContent>
          </Card>

          {/* Rewritten */}
          <Card className="ring-2 ring-gray-900">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Rewritten</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveDraft}>
                    Save Draft
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(result.rewritten);
                      setMessage("Copied!");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm text-gray-700 mb-4">
                {result.rewritten}
              </div>

              {result.changes.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    Changes made:
                  </p>
                  <ul className="space-y-1">
                    {result.changes.map((change, i) => (
                      <li key={i} className="text-xs text-gray-600">
                        • {change}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
