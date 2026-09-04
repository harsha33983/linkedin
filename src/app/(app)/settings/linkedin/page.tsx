"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LinkedInStatus {
  connected: boolean;
  status?: string;
  linkedInMemberId?: string;
  connectedAt?: string;
  tokenValid?: boolean;
  expiresAt?: string;
  schedule?: {
    mode: string;
    postingTime: string | null;
    postingDays: number[];
    maxPerDay: number;
    isPaused: boolean;
  } | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const modeLabels: Record<string, string> = {
  manual: "Manual — Nothing auto-publishes",
  approved_queue: "Approved Queue — Pre-approved drafts publish daily",
  full_auto: "Full Auto — AI drafts publish without per-post review",
};

const modeDescriptions: Record<string, string> = {
  manual: "Drafts sit in the calendar until you manually hit Publish.",
  approved_queue: "You pre-approve drafts. A daily job publishes the next approved item.",
  full_auto:
    "AI-generated drafts publish on schedule from your previously-approved patterns. Requires explicit confirmation.",
};

export default function LinkedInSettingsPage() {
  const [status, setStatus] = useState<LinkedInStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmFullAuto, setConfirmFullAuto] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/linkedin/status");
      const data = await res.json();
      if (data.success) setStatus(data.data);
    } catch (err) {
      console.error("Failed to fetch LinkedIn status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
      }
    } catch {
      setMessage("Failed to connect. Is LinkedIn OAuth configured?");
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect LinkedIn? Auto-publishing will be halted.")) return;
    try {
      await fetch("/api/linkedin/disconnect", { method: "DELETE" });
      setMessage("LinkedIn disconnected.");
      fetchStatus();
    } catch {
      setMessage("Failed to disconnect.");
    }
  };

  const updateMode = async (mode: string) => {
    if (mode === "full_auto" && !confirmFullAuto) {
      setConfirmFullAuto(true);
      return;
    }

    try {
      if (mode === "full_auto") {
        const res = await fetch("/api/publish/schedule/confirm-full-auto", {
          method: "POST",
        });
        const data = await res.json();
        if (data.success) {
          setMessage("Full Auto mode activated.");
          setConfirmFullAuto(false);
        } else {
          setMessage(data.error || "Failed to activate Full Auto.");
        }
      } else {
        const res = await fetch("/api/publish/schedule", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const data = await res.json();
        if (data.success) {
          setMessage(`Switched to ${modeLabels[mode]}`);
        }
      }
      fetchStatus();
    } catch {
      setMessage("Failed to update schedule.");
    }
  };

  const togglePause = async () => {
    if (!status?.schedule) return;
    try {
      await fetch("/api/publish/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPaused: !status.schedule.isPaused }),
      });
      setMessage(status.schedule.isPaused ? "Auto-publish resumed." : "Auto-publish paused.");
      fetchStatus();
    } catch {
      setMessage("Failed to toggle pause.");
    }
  };

  if (loading) return <div className="p-8 text-gray-400 animate-pulse">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">LinkedIn Integration</h1>
      <p className="text-gray-600 mb-6">
        Connect your LinkedIn account to auto-publish approved content.
      </p>

      {message && (
        <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded mb-4">{message}</div>
      )}

      {/* Connection Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Connection</CardTitle>
            {status?.connected ? (
              <Badge className="bg-green-100 text-green-800">Connected</Badge>
            ) : (
              <Badge variant="secondary">Not connected</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {status?.connected ? (
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Connected as member {status.linkedInMemberId || "unknown"}
                {status.connectedAt && ` on ${new Date(status.connectedAt).toLocaleDateString()}`}
              </p>
              {!status.tokenValid && (
                <div className="bg-yellow-50 text-yellow-800 text-sm p-2 rounded mb-3">
                  ⚠ Token expired or invalid. Reconnect to restore auto-publishing.
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={connectLinkedIn}>
                  Reconnect
                </Button>
                <Button variant="ghost" size="sm" className="text-red-500" onClick={disconnect}>
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Connect your LinkedIn account to enable auto-publishing.
                You control what gets posted — nothing publishes without your approval.
              </p>
              <Button onClick={connectLinkedIn}>Connect LinkedIn</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Publish Mode Card */}
      {status?.connected && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Publish Mode</CardTitle>
              {status.schedule?.isPaused && (
                <Badge variant="warning">Paused</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(["manual", "approved_queue", "full_auto"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => updateMode(mode)}
                  className={`w-full text-left border rounded-lg p-4 transition-colors ${
                    status.schedule?.mode === mode
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{modeLabels[mode]}</span>
                    {status.schedule?.mode === mode && (
                      <span className="text-xs text-gray-500">● Active</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{modeDescriptions[mode]}</p>
                  {mode === "full_auto" && confirmFullAuto && status.schedule?.mode !== "full_auto" && (
                    <div className="mt-2 p-2 bg-yellow-50 rounded text-xs text-yellow-800">
                      ⚠ You understand posts will go out without your review?
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateMode("full_auto");
                        }}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmFullAuto(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Pause Toggle */}
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

      {/* Queue Preview */}
      {status?.connected && status.schedule && status.schedule.mode !== "manual" && (
        <Card>
          <CardHeader>
            <CardTitle>Queue Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Mode</p>
                <p className="font-medium capitalize">{status.schedule.mode.replace("_", " ")}</p>
              </div>
              <div>
                <p className="text-gray-500">Posting Days</p>
                <p className="font-medium">
                  {status.schedule.postingDays.map((d) => DAYS[d]).join(", ")}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Max per Day</p>
                <p className="font-medium">{status.schedule.maxPerDay}</p>
              </div>
              <div>
                <p className="text-gray-500">Status</p>
                <p className="font-medium">
                  {status.schedule.isPaused ? "Paused" : "Active"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
