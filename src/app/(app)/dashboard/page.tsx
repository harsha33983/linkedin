"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DashboardData {
  drafts: number;
  ideas: number;
  published: number;
  thisWeek: number;
  voiceDnaStrength: string | null;
  voiceDnaConfirmed: boolean;
  sampleCount: number;
  recentPosts: Array<{
    id: string;
    title: string | null;
    content: string;
    status: string;
    updatedAt: string;
  }>;
  nextIdea: {
    title: string;
    description: string;
  } | null;
  linkedin: {
    connected: boolean;
    schedule?: {
      mode: string;
      isPaused: boolean;
    } | null;
  } | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/posts").then((r) => r.json()),
      fetch("/api/voice").then((r) => r.json()),
      fetch("/api/ideas").then((r) => r.json()),
      fetch("/api/linkedin/status").then((r) => r.json()),
    ])
      .then(([postsRes, voiceRes, ideasRes, linkedinRes]) => {
        const posts = postsRes.success ? postsRes.data : [];
        const voice = voiceRes.success ? voiceRes.data : null;
        const ideas = ideasRes.success ? ideasRes.data : [];
        const linkedin = linkedinRes.success ? linkedinRes.data : null;

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        setData({
          drafts: posts.filter((p: any) => p.status === "DRAFT").length,
          ideas: ideas.length,
          published: posts.filter((p: any) => p.status === "PUBLISHED").length,
          thisWeek: posts.filter(
            (p: any) => new Date(p.createdAt) > weekAgo
          ).length,
          voiceDnaStrength: voice
            ? voice.confidenceScore < 0.4
              ? "Emerging"
              : voice.confidenceScore < 0.7
              ? "Solid"
              : "Strong"
            : null,
          voiceDnaConfirmed: voice?.userConfirmed || false,
          sampleCount: voice?.sampleCount || 0,
          recentPosts: posts.slice(0, 5),
          nextIdea: ideas[0] || null,
          linkedin,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Good morning 👋</h1>
        <p className="text-gray-600 mt-1">
          Here&apos;s your content at a glance.
        </p>
      </div>

      {/* Primary CTA */}
      <div className="mb-8">
        <Link href="/create/ai-post">
          <Button size="lg">✨ Create a Post</Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Drafts</p>
            <p className="text-2xl font-bold">{data?.drafts || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Ideas</p>
            <p className="text-2xl font-bold">{data?.ideas || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">This Week</p>
            <p className="text-2xl font-bold">{data?.thisWeek || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Published</p>
            <p className="text-2xl font-bold">{data?.published || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Next Recommended Idea */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-sm text-gray-500">NEXT RECOMMENDED IDEA</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.nextIdea ? (
            <>
              <p className="text-lg font-medium mb-2">{data.nextIdea.title}</p>
              <p className="text-sm text-gray-600 mb-3">{data.nextIdea.description}</p>
              <Link href={`/create/ai-post?topic=${encodeURIComponent(data.nextIdea.title)}`}>
                <Button size="sm">Generate Post</Button>
              </Link>
            </>
          ) : (
            <p className="text-gray-500 text-sm">
              No ideas yet.{" "}
              <Link href="/content/ideas" className="text-gray-900 font-medium hover:underline">
                Generate ideas
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Voice DNA Status */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-sm text-gray-500">VOICE DNA STRENGTH</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {data?.voiceDnaStrength ? (
              <>
                <Badge
                  className={
                    data.voiceDnaStrength === "Strong"
                      ? "bg-green-100 text-green-800"
                      : data.voiceDnaStrength === "Solid"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-yellow-100 text-yellow-800"
                  }
                >
                  {data.voiceDnaStrength} — {data.sampleCount} samples
                </Badge>
                {data.voiceDnaConfirmed && (
                  <Badge variant="success">✓ Confirmed</Badge>
                )}
                <Link href="/voice-dna" className="text-sm text-gray-900 font-medium hover:underline">
                  View Voice DNA →
                </Link>
              </>
            ) : (
              <>
                <Badge>Not started</Badge>
                <Link href="/voice-dna" className="text-sm text-gray-900 font-medium hover:underline">
                  Add writing samples →
                </Link>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-gray-500">RECENT CONTENT</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.recentPosts && data.recentPosts.length > 0 ? (
            <div className="space-y-3">
              {data.recentPosts.map((post) => (
                <div key={post.id} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {post.title || "Untitled"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(post.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    className={
                      post.status === "PUBLISHED"
                        ? "bg-green-100 text-green-800"
                        : post.status === "DRAFT"
                        ? "bg-gray-100 text-gray-800"
                        : "bg-blue-100 text-blue-800"
                    }
                  >
                    {post.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              No content yet.{" "}
              <Link href="/create/ai-post" className="text-gray-900 font-medium hover:underline">
                Create your first post
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {/* LinkedIn Status */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-sm text-gray-500">LINKEDIN</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.linkedin?.connected ? (
            <div className="flex items-center gap-3">
              <Badge className="bg-green-100 text-green-800">Connected</Badge>
              <span className="text-sm text-gray-600">
                {data.linkedin.schedule?.mode === "manual"
                  ? "Manual"
                  : data.linkedin.schedule?.isPaused
                  ? "Paused"
                  : `Auto: ${data.linkedin.schedule?.mode?.replace("_", " ") || "—"}`}
              </span>
              <Link href="/settings/linkedin" className="text-sm text-gray-900 font-medium hover:underline">
                Manage →
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Badge variant="secondary">Not connected</Badge>
              <Link href="/settings/linkedin" className="text-sm text-gray-900 font-medium hover:underline">
                Connect LinkedIn →
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
