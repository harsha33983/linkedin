"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { zonedTimeToUtc } from "@/lib/tz";
import { useLinkedInGate, connectUrl } from "@/hooks/use-linkedin-gate";

interface QueuePost {
  id: string;
  title: string | null;
  content: string;
  topic: string | null;
  format: string | null;
  status: string;
  queuePosition: number | null;
  scheduledAt: string | null;
  scheduledAtUTC: string | null;
  scheduledTimezone: string | null;
  publishedAt: string | null;
  externalPostId: string | null;
  imageUrl: string | null;
  createdAt: string;
}  const statusColors: Record<string, string> = {
    READY: "bg-blue-100 text-blue-800",
    SCHEDULED: "bg-purple-100 text-purple-800",
    PUBLISHING: "bg-amber-100 text-amber-800",
    PUBLISHED: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
  };

  // Render a schedule time in the timezone it was scheduled for (falls back
  // to the visitor's local timezone). The API returns an unambiguous UTC ISO
  // instant, so this always shows the true wall-clock time the post fires at.
  const formatScheduled = (post: QueuePost): string => {
    const when = new Date(post.scheduledAt!);
    if (post.scheduledTimezone) {
      return when.toLocaleString([], {
        timeZone: post.scheduledTimezone,
        year: "numeric", month: "numeric", day: "numeric",
        hour: "numeric", minute: "2-digit",
      }) + ` ${post.scheduledTimezone.replace("_", " ")}`;
    }
    return when.toLocaleString();
  };

export default function QueuePage() {
  const [posts, setPosts] = useState<QueuePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  // Publishing gate: publishing/scheduling requires a connected LinkedIn account
  const { connected: linkedinConnected } = useLinkedInGate();
  const [connectPrompt, setConnectPrompt] = useState(false);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/queue");
      const data = await res.json();
      if (data.success) setPosts(data.data);
    } catch (err) {
      console.error("Failed to fetch queue:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const moveUp = async (id: string, currentIndex: number) => {
    if (currentIndex === 0) return;
    const currentPos = posts[currentIndex].queuePosition || currentIndex;
    const swapPos = posts[currentIndex - 1].queuePosition || currentIndex - 1;

    // Swap positions
    await fetch(`/api/queue/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queuePosition: swapPos }),
    });
    await fetch(`/api/queue/${posts[currentIndex - 1].id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queuePosition: currentPos }),
    });
    fetchQueue();
  };

  const moveDown = async (id: string, currentIndex: number) => {
    if (currentIndex === posts.length - 1) return;
    const currentPos = posts[currentIndex].queuePosition || currentIndex;
    const swapPos = posts[currentIndex + 1].queuePosition || currentIndex + 2;

    await fetch(`/api/queue/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queuePosition: swapPos }),
    });
    await fetch(`/api/queue/${posts[currentIndex + 1].id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queuePosition: currentPos }),
    });
    fetchQueue();
  };

  const removeFromQueue = async (id: string) => {
    try {
      await fetch(`/api/queue/${id}`, { method: "DELETE" });
      setMessage("Post removed from queue.");
      fetchQueue();
    } catch {
      setMessage("Failed to remove from queue.");
    }
  };

  const publishNow = async (id: string, label: string) => {
    // Gate: publishing requires a connected LinkedIn account
    if (linkedinConnected === false) {
      setConnectPrompt(true);
      return;
    }
    if (!confirm(`${label} this post to LinkedIn now?`)) return;
    try {
      const res = await fetch(`/api/queue/${id}/publish-now`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setMessage("Published to LinkedIn!");
      } else {
        setMessage(data.error || "Failed to publish.");
      }
      fetchQueue();
    } catch {
      setMessage("Failed to publish.");
    }
  };

  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [scheduleHour, setScheduleHour] = useState(9);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [scheduleAmPm, setScheduleAmPm] = useState<"AM" | "PM">("AM");
  const [scheduleTimezone, setScheduleTimezone] = useState("Asia/Kolkata");

  const TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Kolkata", "Asia/Tokyo"];

  const schedulePost = async (id: string) => {
    // Gate: scheduled publishing needs a connected LinkedIn account
    if (linkedinConnected === false) {
      setConnectPrompt(true);
      return;
    }
    try {
      const hour24 = scheduleAmPm === "PM" ? (scheduleHour % 12) + 12 : scheduleHour % 12;
      const time = `${String(hour24).padStart(2, "0")}:${String(scheduleMinute).padStart(2, "0")}`;
      // Convert the chosen wall-clock time (in the user's selected timezone)
      // to the correct UTC instant.
      const utcDate = zonedTimeToUtc(scheduleDate, time, scheduleTimezone);
      await fetch(`/api/queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: utcDate.toISOString(), scheduledTimezone: scheduleTimezone }),
      });
      setMessage("Post scheduled!");
      setSchedulingId(null);
      fetchQueue();
    } catch {
      setMessage("Failed to schedule.");
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Content Queue</h1>
          <p className="text-gray-600 mt-1">{posts.length} posts queued</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchQueue}>
          Refresh
        </Button>
      </div>

      {message && (
        <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded mb-4">{message}</div>
      )}

      {/* LinkedIn connection prompt: shown when Publish/Schedule is clicked while disconnected */}
      {connectPrompt && linkedinConnected === false && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm p-4 rounded mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Connect LinkedIn to publish</p>
            <p className="text-amber-700">
              Queued and scheduled posts only go out once your LinkedIn account is
              connected.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => {
                window.location.href = connectUrl("/queue");
              }}
            >
              🔗 Connect LinkedIn
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConnectPrompt(false)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 animate-pulse">Loading queue...</div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            No posts in queue.{" "}
            <a href="/create/ai-post" className="text-gray-900 font-medium hover:underline">
              Generate a post
            </a>{" "}
            or{" "}
            <a href="/content" className="text-gray-900 font-medium hover:underline">
              add from content library
            </a>.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post, index) => (
            <Card key={post.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Position */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <span className="text-lg font-bold text-gray-400 w-6 text-center">{index + 1}</span>
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveUp(post.id, index)}
                        disabled={index === 0}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-30 text-xs"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveDown(post.id, index)}
                        disabled={index === posts.length - 1}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-30 text-xs"
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  {/* Image thumbnail */}
                  {post.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.imageUrl}
                      alt="Post image"
                      className="w-16 h-16 rounded-lg object-cover border border-gray-200 shrink-0"
                    />
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm truncate">
                        {post.title || "Untitled"}
                      </h3>
                      <Badge className={statusColors[post.status] || "bg-gray-100 text-gray-800"}>
                        {post.status}
                      </Badge>
                      {post.format && (
                        <Badge variant="secondary">{post.format}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-2">
                      {post.scheduledAt && (
                        <span>Scheduled: {formatScheduled(post)}</span>
                      )}
                      {post.externalPostId && (
                        <span className="text-green-600">✓ Published</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    {post.status !== "PUBLISHED" && post.status !== "PUBLISHING" && (
                      <Button
                        size="sm"
                        variant={post.status === "FAILED" ? "destructive" : "default"}
                        onClick={() =>
                          publishNow(
                            post.id,
                            post.status === "FAILED" ? "Retry publishing" : post.status === "SCHEDULED" ? "Publish now (ignore schedule)" : "Publish"
                          )
                        }
                      >
                        {post.status === "FAILED" ? "Retry" : post.status === "SCHEDULED" ? "Publish Now" : "Publish"}
                      </Button>
                    )}
                    {post.status === "SCHEDULED" ? (
                      <Button size="sm" variant="ghost" onClick={() => setSchedulingId(schedulingId === post.id ? null : post.id)}>
                        {schedulingId === post.id ? "Cancel" : "Reschedule"}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setSchedulingId(schedulingId === post.id ? null : post.id)}>
                        {schedulingId === post.id ? "Cancel" : "Schedule"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => removeFromQueue(post.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Schedule Modal ───────────────────────────── */}
      {schedulingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSchedulingId(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Schedule Post</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Time</label>
                <div className="flex gap-2 items-center">
                  <select
                    value={scheduleHour}
                    onChange={(e) => setScheduleHour(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-gray-400">:</span>
                  <select
                    value={scheduleMinute}
                    onChange={(e) => setScheduleMinute(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    {[0, 15, 30, 45].map((m) => (
                      <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                    ))}
                  </select>
                  <div className="flex border border-gray-300 rounded-md overflow-hidden">
                    <button
                      onClick={() => setScheduleAmPm("AM")}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${scheduleAmPm === "AM" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}
                    >
                      AM
                    </button>
                    <button
                      onClick={() => setScheduleAmPm("PM")}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${scheduleAmPm === "PM" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}
                    >
                      PM
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {scheduleHour}:{String(scheduleMinute).padStart(2, "0")} {scheduleAmPm} {scheduleTimezone.replace("_", " ")}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Timezone</label>
                <select
                  value={scheduleTimezone}
                  onChange={(e) => setScheduleTimezone(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setSchedulingId(null)}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1" onClick={() => schedulePost(schedulingId)}>
                Schedule
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
