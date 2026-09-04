"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QueueJob {
  id: string;
  postId: string | null;
  jobType: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  errorMessage: string | null;
  completedAt: string | null;
  failedAt: string | null;
  createdAt: string;
  lockedBy: string | null;
  post: { title: string | null; content: string } | null;
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
  token_refresh: "Token Refresh",
  voice_reanalysis: "Voice Reanalysis",
};

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/jobs");
      const data = await res.json();
      if (data.success) setJobs(data.data);
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

  const filteredJobs = filter === "ALL" ? jobs : jobs.filter((j) => j.status === filter);

  const counts = {
    ALL: jobs.length,
    QUEUED: jobs.filter((j) => j.status === "QUEUED").length,
    PROCESSING: jobs.filter((j) => j.status === "PROCESSING").length,
    SUCCESS: jobs.filter((j) => j.status === "SUCCESS").length,
    FAILED: jobs.filter((j) => j.status === "FAILED").length,
    RETRYING: jobs.filter((j) => j.status === "RETRYING").length,
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Job Monitor</h1>
          <p className="text-gray-600 mt-1">Background job queue status</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchJobs}>
          Refresh
        </Button>
      </div>

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
            No jobs found.
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium text-gray-600">Job ID</th>
                <th className="text-left p-3 font-medium text-gray-600">Type</th>
                <th className="text-left p-3 font-medium text-gray-600">Post</th>
                <th className="text-left p-3 font-medium text-gray-600">Status</th>
                <th className="text-left p-3 font-medium text-gray-600">Attempts</th>
                <th className="text-left p-3 font-medium text-gray-600">Last Error</th>
                <th className="text-left p-3 font-medium text-gray-600">Created</th>
                <th className="text-left p-3 font-medium text-gray-600">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredJobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs text-gray-500">
                    {job.id.slice(0, 12)}...
                  </td>
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
                    {job.attempts}/{job.maxAttempts}
                  </td>
                  <td className="p-3 text-xs text-red-600 max-w-[200px] truncate">
                    {job.errorMessage || "—"}
                  </td>
                  <td className="p-3 text-xs text-gray-500">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3 text-xs text-gray-500">
                    {job.completedAt ? new Date(job.completedAt).toLocaleString() : "—"}
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
