"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface LinkedInStatus {
  connected: boolean;
  socialAccountId?: string;
  status?: string;
  displayName?: string;
  linkedInMemberId?: string;
  connectedAt?: string;
  tokenValid?: boolean;
  expiresAt?: string;
  schedule?: {
    mode: string;
    postingTime: string | null;
    postingTimezone: string | null;
    postingDays: number[];
    maxPerDay: number;
    isPaused: boolean;
    linkedinAccountId: string | null;
  } | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Dubai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export default function IntegrationsPage() {
  const [status, setStatus] = useState<LinkedInStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [scheduleDraft, setScheduleDraft] = useState({
    postingTime: "09:00",
    postingTimezone: "Asia/Kolkata",
    postingDays: [1, 2, 3, 4, 5],
    maxPerDay: 1,
  });
  const [saving, setSaving] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/linkedin/status");
      const data = await res.json();
      if (data.success) {
        setStatus(data.data);
        if (data.data.schedule) {
          setScheduleDraft({
            postingTime: data.data.schedule.postingTime || "09:00",
            postingTimezone: data.data.schedule.postingTimezone || "Asia/Kolkata",
            postingDays: data.data.schedule.postingDays || [1, 2, 3, 4, 5],
            maxPerDay: data.data.schedule.maxPerDay || 1,
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch LinkedIn status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check for URL params
    const params = new URLSearchParams(window.location.search);
    if (params.get("linkedin") === "connected") {
      setMessage("LinkedIn connected successfully!");
      setMessageType("success");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("error")) {
      setMessage(params.get("message") || "LinkedIn connection failed");
      setMessageType("error");
      window.history.replaceState({}, "", window.location.pathname);
    }
    fetchStatus();
  }, [fetchStatus]);

  const connectLinkedIn = async () => {
    try {
      const res = await fetch("/api/linkedin/connect");
      const data = await res.json();
      if (data.success && data.data.authUrl) {
        window.location.href = data.data.authUrl;
      } else {
        setMessage(data.error || "Failed to initiate connection");
        setMessageType("error");
      }
    } catch {
      setMessage("Failed to connect. Is LinkedIn OAuth configured?");
      setMessageType("error");
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect LinkedIn? Auto-publishing will be halted.")) return;
    try {
      await fetch("/api/linkedin/disconnect", { method: "DELETE" });
      setMessage("LinkedIn disconnected.");
      setMessageType("success");
      fetchStatus();
    } catch {
      setMessage("Failed to disconnect.");
      setMessageType("error");
    }
  };

  const updateSchedule = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scheduleDraft),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("Schedule updated.");
        setMessageType("success");
      } else {
        setMessage(data.error || "Failed to update schedule.");
        setMessageType("error");
      }
    } catch {
      setMessage("Failed to save schedule.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  const updateMode = async (mode: string) => {
    try {
      if (mode === "full_auto") {
        const res = await fetch("/api/schedule/confirm-full-auto", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          setMessage("Full Auto mode activated.");
          setMessageType("success");
        } else {
          setMessage(data.error || "Failed to activate Full Auto.");
          setMessageType("error");
        }
      } else {
        const res = await fetch("/api/schedule", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const data = await res.json();
        if (data.success) {
          setMessage(`Switched to ${mode === "manual" ? "Manual" : "Approved Queue"} mode.`);
          setMessageType("success");
        }
      }
      fetchStatus();
    } catch {
      setMessage("Failed to update mode.");
      setMessageType("error");
    }
  };

  const togglePause = async () => {
    if (!status?.schedule) return;
    try {
      await fetch("/api/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPaused: !status.schedule.isPaused }),
      });
      setMessage(status.schedule.isPaused ? "Auto-publish resumed." : "Auto-publish paused.");
      setMessageType("success");
      fetchStatus();
    } catch {
      setMessage("Failed to toggle.");
      setMessageType("error");
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-3xl">
        <div className="space-y-4">
          <div className="h-8 bg-gray-100 rounded w-48 animate-pulse" />
          <div className="h-40 bg-gray-100 rounded animate-pulse" />
          <div className="h-40 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Integrations</h1>
        <p className="text-gray-500">Connect your social accounts and configure publishing.</p>
      </div>

      {message && (
        <div
          className={`text-sm p-3 rounded mb-6 ${
            messageType === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message}
        </div>
      )}

      {/* ── LinkedIn Connection Card ─────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              <svg className="w-6 h-6" fill="#0A66C2" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              LinkedIn
            </CardTitle>
            {status?.connected ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary">Not connected</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {status?.connected ? (
            <div>
              <p className="text-sm text-gray-600 mb-1">
                {status.displayName || `Member ${status.linkedInMemberId}`}
              </p>
              <p className="text-xs text-gray-400 mb-4">
                Connected {status.connectedAt && `on ${new Date(status.connectedAt).toLocaleDateString()}`}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                <span>Permissions:</span>
                <Badge variant="outline" className="text-xs">Publishing enabled</Badge>
              </div>
              {!status.tokenValid && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-lg mb-4 flex items-center gap-2">
                  <span>⚠</span>
                  <span>Your LinkedIn connection needs to be reconnected.</span>
                  <Button size="sm" variant="outline" onClick={connectLinkedIn} className="ml-auto">
                    Reconnect
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={connectLinkedIn}>
                  Reconnect
                </Button>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={disconnect}>
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-gray-500 mb-1">Connect your LinkedIn account to publish directly from your content calendar.</p>
              <p className="text-xs text-gray-400 mb-6">You control what gets posted — nothing publishes without your approval.</p>
              <Button onClick={connectLinkedIn} size="lg">
                Connect LinkedIn
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Publish Mode Card ───────────────────────────── */}
      {status?.connected && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Publish Mode</CardTitle>
              {status.schedule?.isPaused && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">Paused</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { mode: "manual", label: "Manual", desc: "Nothing auto-publishes. Drafts sit in your calendar until you hit Publish." },
                { mode: "approved_queue", label: "Approved Queue", desc: "You pre-approve drafts into a queue. A daily job publishes the next approved item at your chosen time." },
                { mode: "full_auto", label: "Full Auto", desc: "AI-generated drafts publish on schedule from your previously-approved patterns. Requires explicit confirmation." },
              ].map((option) => (
                <button
                  key={option.mode}
                  onClick={() => updateMode(option.mode)}
                  className={`w-full text-left border rounded-lg p-4 transition-all ${
                    status.schedule?.mode === option.mode
                      ? "border-gray-900 bg-gray-50 shadow-sm"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{option.label}</span>
                    {status.schedule?.mode === option.mode && (
                      <span className="text-xs text-green-600 font-medium">● Active</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{option.desc}</p>
                </button>
              ))}
            </div>

            {status.schedule && status.schedule.mode !== "manual" && (
              <div className="mt-4 pt-4 border-t">
                <Button
                  variant={status.schedule.isPaused ? "default" : "outline"}
                  size="sm"
                  onClick={togglePause}
                >
                  {status.schedule.isPaused ? "▶ Resume Auto-Publish" : "⏸ Pause Auto-Publish"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Schedule Settings Card ──────────────────────── */}
      {status?.connected && status.schedule && status.schedule.mode !== "manual" && (
        <Card>
          <CardHeader>
            <CardTitle>Auto-Publish Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Frequency</label>
                <select
                  value={scheduleDraft.postingDays.length === 7 ? "daily" : "weekdays"}
                  onChange={(e) => {
                    setScheduleDraft({
                      ...scheduleDraft,
                      postingDays: e.target.value === "daily" ? [0,1,2,3,4,5,6] : [1,2,3,4,5],
                    });
                  }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="weekdays">Every weekday</option>
                  <option value="daily">Every day</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Time</label>
                <Input
                  type="time"
                  value={scheduleDraft.postingTime}
                  onChange={(e) => setScheduleDraft({ ...scheduleDraft, postingTime: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Timezone</label>
                <select
                  value={scheduleDraft.postingTimezone}
                  onChange={(e) => setScheduleDraft({ ...scheduleDraft, postingTimezone: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Max posts per day</label>
                <select
                  value={scheduleDraft.maxPerDay}
                  onChange={(e) => setScheduleDraft({ ...scheduleDraft, maxPerDay: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value={1}>1 post</option>
                  <option value={2}>2 posts</option>
                  <option value={3}>3 posts</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-xs text-gray-400">
                Content source: <span className="font-medium">Content Queue</span>
              </p>
              <Button size="sm" onClick={updateSchedule} disabled={saving}>
                {saving ? "Saving..." : "Save Schedule"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
