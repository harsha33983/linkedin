"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface QueueJob {
  id: string;
  postId: string | null;
  jobType: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  scheduledAt: string | null;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
  post: { id: string; title: string | null; status: string } | null;
}

interface SchedulerInfo {
  running: boolean;
  activeSchedules: number;
  userSchedule: {
    mode: string;
    isPaused: boolean;
    postingTime: string | null;
    postingTimezone: string | null;
    maxPerDay: number;
  } | null;
  pendingPosts: number;
  publishedToday: number;
  lockedPosts: number;
}

const statusColors: Record<string, string> = {
  QUEUED: "bg-gray-100 text-gray-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  SUCCESS: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  RETRYING: "bg-amber-100 text-amber-800",
};

const jobTypeLabels: Record<string, string> = {
  auto_publish: "Auto Publish",
  scheduled_publish: "Scheduled Publish",
  manual_publish: "Manual Publish",
  publish: "Publish",
  token_refresh: "Token Refresh",
  voice_reanalysis: "Voice Reanalysis",
};

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [message, setMessage] = useState("");

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/jobs");
      const data = await res.json();
      if (data.success) {
        setJobs(data.data);
        setScheduler(data.scheduler || null);
      }
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const act = async (body: Record<string, unknown>) => {
    setMessage("");
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setMessage(data.message || data.error || "Done.");
      fetchJobs();
    } catch {
      setMessage("Action failed.");
    }
  };

  const filteredJobs = filter === "ALL" ? jobs : jobs.filter((j) => j.status === filter);

  const counts = {
    ALL: jobs.length,
    QUEUED: jobs.filter((j) => j.status === "QUEUED").length,
    PROCESSING: jobs.filter((j) => j.status === "PROCESSING").length,
    SUCCESS: jobs.filter((j) => j.status === "SUCCESS").length,
    FAILED: jobs.filter((j) => j.status === "FAILED").length,
    RETRYING: jobs.filter((j) => j.status === "RETRYING").length,
  };

  const modeLabel = scheduler?.userSchedule
    ? `${scheduler.userSchedule.mode}${scheduler.userSchedule.isPaused ? " (paused)" : ""}`
    : "not configured";

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Job Monitor</h1>
          <p className="text-gray-600 mt-1">Publish scheduler activity and job history</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => act({ action: "clear_history" })}>
            Reset failed → drafts
          </Button>
          <Button variant="outline" size="sm" onClick={fetchJobs}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Scheduler status banner */}
      {scheduler && (
        <Card className="mb-6">
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  scheduler.running ? "bg-green-500 animate-pulse" : "bg-red-500"
                }`}
                aria-hidden
              />
              <span className="font-medium text-sm">
                Scheduler {scheduler.running ? "running" : "stopped"}
              </span>
              <Badge variant="secondary">mode: {modeLabel}</Badge>
              {scheduler.userSchedule?.postingTime && (
                <Badge variant="secondary">
                  daily at {scheduler.userSchedule.postingTime}{" "}
                  {scheduler.userSchedule.postingTimezone}
                </Badge>
              )}
            </div>
            <div className="flex gap-4 text-sm text-gray-600">
              <span>
                Pending: <strong>{scheduler.pendingPosts}</strong>
              </span>
              <span>
                Published today: <strong>{scheduler.publishedToday}</strong>
              </span>
              <span>
                Locked: <strong>{scheduler.lockedPosts}</strong>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {message && (
        <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded mb-4">{message}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {(["QUEUED", "PROCESSING", "SUCCESS", "FAILED", "RETRYING"] as const).map((status) => (
          <div key={status} className="border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{counts[status]}</div>
            <div className="text-xs text-gray-500">{status}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {(["ALL", "QUEUED", "PROCESSING", "SUCCESS", "FAILED", "RETRYING"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 rounded-md text-sm border whitespace-nowrap ${
              filter === status
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-300 hover:border-gray-900"
            }`}
          >
            {status} ({counts[status]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 animate-pulse">Loading jobs...</div>
      ) : filteredJobs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            No publish activity yet. Scheduled and auto-publish jobs appear here when created.
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium text-gray-600">Type</th>
                <th className="text-left p-3 font-medium text-gray-600">Post</th>
                <th className="text-left p-3 font-medium text-gray-600">Status</th>
                <th className="text-left p-3 font-medium text-gray-600">Scheduled</th>
                <th className="text-left p-3 font-medium text-gray-600">Last activity</th>
                <th className="text-left p-3 font-medium text-gray-600">Error</th>
                <th className="text-left p-3 font-medium text-gray-600">Completed</th>
                <th className="text-left p-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredJobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="p-3 text-xs">
                    {jobTypeLabels[job.jobType] || job.jobType}
                  </td>
                  <td className="p-3 text-xs max-w-[200px] truncate">
                    {job.post?.title || job.postId || "—"}
                  </td>
                  <td className="p-3">
                    <Badge className={statusColors[job.status] || ""}>{job.status}</Badge>
                  </td>
                  <td className="p-3 text-xs text-gray-500">
                    {job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : "—"}
                  </td>
                  <td className="p-3 text-xs text-gray-500">
                    {job.lastAttemptAt ? new Date(job.lastAttemptAt).toLocaleString() : "—"}
                  </td>
                  <td className="p-3 text-xs text-red-600 max-w-[200px] truncate">
                    {job.errorMessage || "—"}
                  </td>
                  <td className="p-3 text-xs text-gray-500">
                    {job.completedAt ? new Date(job.completedAt).toLocaleString() : "—"}
                  </td>
                  <td className="p-3">
                    {job.status === "PROCESSING" && job.postId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => act({ action: "clear_stale_lock", postId: job.postId })}
                      >
                        Release lock
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
