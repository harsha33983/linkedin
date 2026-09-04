"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Post {
  id: string;
  title: string | null;
  content: string;
  topic: string | null;
  format: string | null;
  status: string;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_FILTERS = ["ALL", "DRAFT", "SAVED", "APPROVED", "SCHEDULED", "PUBLISHED", "ARCHIVED"];

const statusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    SAVED: "bg-blue-100 text-blue-800",
    APPROVED: "bg-green-100 text-green-800",
    SCHEDULED: "bg-purple-100 text-purple-800",
    PUBLISHED: "bg-emerald-100 text-emerald-800",
    ARCHIVED: "bg-orange-100 text-orange-800",
  };
  return colors[status] || colors.DRAFT;
};

export default function ContentPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [message, setMessage] = useState("");

  const fetchPosts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/posts?${params}`);
      const data = await res.json();
      if (data.success) setPosts(data.data);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const deletePost = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    try {
      await fetch(`/api/posts/${id}`, { method: "DELETE" });
      setMessage("Post deleted.");
      fetchPosts();
    } catch {
      setMessage("Failed to delete.");
    }
  };

  const duplicatePost = async (id: string) => {
    try {
      await fetch(`/api/posts/${id}/duplicate`, { method: "POST" });
      setMessage("Post duplicated as draft.");
      fetchPosts();
    } catch {
      setMessage("Failed to duplicate.");
    }
  };

  const archivePost = async (id: string) => {
    try {
      await fetch(`/api/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      setMessage("Post archived.");
      fetchPosts();
    } catch {
      setMessage("Failed to archive.");
    }
  };

  const approvePost = async (id: string) => {
    try {
      const res = await fetch(`/api/posts/${id}/approve`, { method: "POST" });
      const data = await res.json();
      setMessage(data.message || "Post approved.");
      fetchPosts();
    } catch {
      setMessage("Failed to approve.");
    }
  };

  const publishPost = async (id: string) => {
    try {
      const res = await fetch(`/api/posts/${id}/publish`, { method: "POST" });
      const data = await res.json();
      setMessage(data.message || "Published!");
      fetchPosts();
    } catch {
      setMessage("Failed to publish.");
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Content Library</h1>
          <p className="text-gray-600 mt-1">{posts.length} posts</p>
        </div>
      </div>

      {message && (
        <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded mb-4">
          {message}
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts..."
          />
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-md text-sm border whitespace-nowrap transition-colors ${
              statusFilter === status
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-300 hover:border-gray-900"
            }`}
          >
            {status === "ALL" ? "All" : status.charAt(0) + status.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Posts List */}
      {loading ? (
        <div className="text-gray-400 animate-pulse">Loading...</div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            No posts found.{" "}
            <a href="/create/ai-post" className="text-gray-900 font-medium hover:underline">
              Create your first post
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Post Image */}
                  {post.imageUrl && (
                    <div className="w-24 h-18 rounded-lg overflow-hidden shrink-0">
                      <img
                        src={post.imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-4 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm truncate">
                        {post.title || "Untitled"}
                      </h3>
                      <Badge className={statusColor(post.status)}>
                        {post.status}
                      </Badge>
                      {post.format && (
                        <Badge variant="secondary">{post.format}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {post.content}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(post.updatedAt).toLocaleDateString()}
                      {post.topic && ` · ${post.topic}`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {post.status === "DRAFT" && (
                      <Button size="sm" variant="ghost" onClick={() => approvePost(post.id)}>
                        Approve
                      </Button>
                    )}
                    {(post.status === "APPROVED" || post.status === "DRAFT") && (
                      <Button size="sm" variant="ghost" onClick={() => publishPost(post.id)}>
                        Publish
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => duplicatePost(post.id)}>
                      Copy
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => archivePost(post.id)}>
                      Archive
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deletePost(post.id)}>
                      Del
                    </Button>
                  </div>
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
