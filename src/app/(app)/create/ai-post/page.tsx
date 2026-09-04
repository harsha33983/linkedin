"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { zonedTimeToUtc } from "@/lib/tz";

interface PostVersion {
  id: string;
  label: string;
  content: string;
  hook: string;
  format: string;
  scores: { overall: number; voiceFit: number };
  imageUrl?: string;
}

interface GenerationResult {
  versions: PostVersion[];
  metadata: { model: string; voiceDnaVersionUsed: number; confidenceScore: number };
  generationId: string;
}

const FORMATS = [
  "Educational",
  "Personal story",
  "Contrarian",
  "Opinion",
  "Listicle",
  "Framework",
  "Case study",
  "Lesson learned",
  "Announcement",
  "Promotional",
];

const REJECTION_REASONS = [
  { value: "wrong_tone", label: "Wrong tone" },
  { value: "not_my_experience", label: "Not my experience" },
  { value: "too_generic", label: "Too generic" },
  { value: "wrong_format", label: "Wrong format" },
  { value: "other", label: "Other" },
];

export default function AiPostPage() {
  // Form state
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [format, setFormat] = useState("");
  const [tone, setTone] = useState("");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [targetAudience, setTargetAudience] = useState("");

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState("");

  // Prefill the topic (and format) from ?topic= / ?format= — e.g. when the
  // user clicks "Draft post" on an idea card in the Ideas module.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    prefilledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("topic");
    const f = params.get("format");
    if (t) setTopic(t);
    if (f) setFormat(f);
  }, []);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // Rejection state
  const [rejectingVersion, setRejectingVersion] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // Scheduling state (per generated version)
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [scheduleHour, setScheduleHour] = useState(9);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [scheduleAmPm, setScheduleAmPm] = useState<"AM" | "PM">("AM");
  const [scheduleTimezone, setScheduleTimezone] = useState("Asia/Kolkata");

  // Image state (per generated version): system-generated vs user-uploaded
  const [imageChoice, setImageChoice] = useState<Record<string, "system" | "custom">>({});
  const [customImages, setCustomImages] = useState<Record<string, string>>({});
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);

  const TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Kolkata", "Asia/Tokyo"];

  /** The image that will actually be used for a version (custom wins over generated). */
  const effectiveImageUrl = (v: PostVersion): string | undefined => {
    if (imageChoice[v.id] === "custom" && customImages[v.id]) {
      return customImages[v.id];
    }
    return v.imageUrl;
  };

  const uploadCustomImage = async (versionId: string, file: File) => {
    if (!file) return;
    setUploadingImageId(versionId);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/image", { method: "POST", body: form });
      const data = await res.json();
      if (data.success && data.url) {
        setCustomImages((prev) => ({ ...prev, [versionId]: data.url }));
        setImageChoice((prev) => ({ ...prev, [versionId]: "custom" }));
        setMessage("Image added — this version will publish with your image.");
      } else {
        setMessage(data.error || "Image upload failed.");
      }
    } catch {
      setMessage("Image upload failed.");
    } finally {
      setUploadingImageId(null);
    }
  };

  const generate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/ai/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          goal: goal || undefined,
          format: format || undefined,
          tone: tone || undefined,
          length,
          targetAudience: targetAudience || undefined,
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

  const saveDraft = async (version: PostVersion) => {
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: version.hook,
          content: version.content,
          topic,
          format: version.format,
          status: "DRAFT",
          voiceDnaVersionUsed: result?.metadata.voiceDnaVersionUsed,
          imageUrl: effectiveImageUrl(version) ?? null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("Draft saved!");
        setSelectedVersion(null);
      }
    } catch {
      setMessage("Failed to save draft");
    }
  };

  const scheduleVersion = async (version: PostVersion) => {
    if (!topic.trim()) return;
    setScheduleBusy(true);
    setMessage("");
    try {
      // 1. Persist the generated version as a draft post
      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: version.hook,
          content: version.content,
          topic,
          format: version.format,
          status: "DRAFT",
          voiceDnaVersionUsed: result?.metadata.voiceDnaVersionUsed,
          imageUrl: effectiveImageUrl(version) ?? null,
        }),
      });
      const created = await createRes.json();
      if (!created.success || !created.data?.id) {
        setMessage(created.error || "Failed to schedule.");
        return;
      }

      // 2. Mark it scheduled at the chosen wall-clock time (in the user's timezone)
      const hour24 = scheduleAmPm === "PM" ? (scheduleHour % 12) + 12 : scheduleHour % 12;
      const time = `${String(hour24).padStart(2, "0")}:${String(scheduleMinute).padStart(2, "0")}`;
      const utcDate = zonedTimeToUtc(scheduleDate, time, scheduleTimezone);

      const patchRes = await fetch(`/api/posts/${created.data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "SCHEDULED",
          scheduledAt: utcDate.toISOString(),
        }),
      });
      const patched = await patchRes.json();
      if (!patched.success) {
        setMessage(patched.error || "Failed to schedule.");
        return;
      }

      setSchedulingId(null);
      setMessage(
        `✅ Scheduled for ${scheduleDate} at ${String(hour24).padStart(2, "0")}:${String(
          scheduleMinute
        ).padStart(2, "0")} ${scheduleAmPm} (${scheduleTimezone}). View it in Queue.`
      );
    } catch {
      setMessage("Failed to schedule.");
    } finally {
      setScheduleBusy(false);
    }
  };

  const rejectVersion = async (versionId: string, reason: string) => {
    if (!result?.generationId) return;
    try {
      await fetch(`/api/generation/${result.generationId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      setRejectingVersion(null);
      setMessage("Feedback recorded — this helps us learn your voice.");
    } catch {
      // Non-critical, silently fail
    }
  };

  const startEdit = (version: PostVersion) => {
    setEditingVersion(version.id);
    setEditContent(version.content);
  };

  const saveEdit = async () => {
    if (!editingVersion || !result) return;
    // Update the version in-place for display
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        versions: prev.versions.map((v) =>
          v.id === editingVersion ? { ...v, content: editContent } : v
        ),
      };
    });
    setEditingVersion(null);
    setMessage("Edit applied. Save as draft when ready.");
  };

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-2">Create a Post</h1>
      <p className="text-gray-600 mb-8">
        Generate 3 personalized versions using your Voice DNA.
      </p>

      {message && (
        <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded mb-6">
          {message}
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded mb-6">
          {error}
          {error.includes("No Voice DNA found") && (
            <div className="mt-2 text-red-600">
              Pick one of the formats above to generate without Voice DNA, or{" "}
              <a href="/voice-dna" className="underline font-medium">
                add writing samples on the Voice DNA page
              </a>
              {" "}so posts match your voice.
            </div>
          )}
        </div>
      )}

      {/* Input Form */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">
                Topic <span className="text-red-500">*</span>
              </label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What should the post be about?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Target Audience
              </label>
              <Input
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g., Founders, Developers"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Goal</label>
              <Input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g., Build authority, Generate leads"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Best match for Voice DNA</option>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Length</label>
              <select
                value={length}
                onChange={(e) =>
                  setLength(e.target.value as "short" | "medium" | "long")
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="short">Short (1-2 paragraphs)</option>
                <option value="medium">Medium (3-5 paragraphs)</option>
                <option value="long">Long (6+ paragraphs)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">
                Tone Override (optional)
              </label>
              <Input
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="Default: My Voice (uses Voice DNA)"
              />
            </div>
          </div>

          <div className="mt-4">
            <Button onClick={generate} disabled={!topic.trim() || generating}>
              {generating ? "Generating..." : "✨ Generate 3 Versions"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generated Versions */}
      {result && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Generated Posts</h2>
          {result.metadata.confidenceScore < 0.4 && (
            <div className="bg-yellow-50 text-yellow-800 text-sm p-3 rounded mb-4">
              Based on limited samples — results may feel generic until you add
              more writing samples.
            </div>
          )}

          <div className="space-y-6">
            {result.versions.map((version) => (
              <Card
                key={version.id}
                className={
                  selectedVersion === version.id
                    ? "ring-2 ring-gray-900"
                    : ""
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">
                        {version.label}
                      </CardTitle>
                      <Badge variant="secondary">{version.format}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>
                        Overall: {version.scores.overall}
                      </span>
                      <span>
                        Voice Fit: {version.scores.voiceFit}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Cover Image — system-generated or user-uploaded */}
                  {effectiveImageUrl(version) && (
                    <div className="mb-3 rounded-lg overflow-hidden">
                      <img
                        src={effectiveImageUrl(version)}
                        alt={`Cover for ${version.label}`}
                        className="w-full h-48 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}

                  {/* Image source controls */}
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 mr-1">
                      Image:
                    </span>
                    {version.imageUrl && (
                      <Button
                        size="sm"
                        variant={
                          imageChoice[version.id] !== "custom"
                            ? "default"
                            : "outline"
                        }
                        onClick={() =>
                          setImageChoice((prev) => ({
                            ...prev,
                            [version.id]: "system",
                          }))
                        }
                      >
                        ✨ Generated image
                      </Button>
                    )}
                    <label
                      htmlFor={`img-upload-${version.id}`}
                      className={`cursor-pointer inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                        imageChoice[version.id] === "custom"
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {uploadingImageId === version.id
                        ? "Uploading…"
                        : customImages[version.id]
                        ? "🖼 Use my image"
                        : version.imageUrl
                        ? "⬆ Upload my own image"
                        : "⬆ Add a cover image"}
                    </label>
                    <input
                      id={`img-upload-${version.id}`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={uploadingImageId === version.id}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadCustomImage(version.id, f);
                        e.target.value = "";
                      }}
                    />
                    {imageChoice[version.id] === "custom" &&
                      customImages[version.id] &&
                      version.imageUrl && (
                        <span className="text-xs text-gray-400">
                          Publishing with your image
                        </span>
                      )}
                  </div>

                  {editingVersion === version.id ? (
                    <div>
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={12}
                        className="mb-3"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveEdit}>
                          Apply Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingVersion(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm text-gray-700 mb-4">
                      {version.content}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                    <Button
                      size="sm"
                      onClick={() => saveDraft(version)}
                    >
                      Save Draft
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(version)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(version.content);
                        setMessage("Copied to clipboard!");
                      }}
                    >
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => generate()}
                    >
                      Regenerate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSchedulingId((cur) =>
                          cur === version.id ? null : version.id
                        )
                      }
                    >
                      {schedulingId === version.id
                        ? "Close Schedule"
                        : "🗓 Schedule"}
                    </Button>

                    {/* Scheduling panel */}
                    {schedulingId === version.id && (
                      <div className="w-full mt-3 p-4 border rounded-lg bg-gray-50">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              Date
                            </label>
                            <input
                              type="date"
                              value={scheduleDate}
                              onChange={(e) =>
                                setScheduleDate(e.target.value)
                              }
                              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              Hour
                            </label>
                            <select
                              value={scheduleHour}
                              onChange={(e) =>
                                setScheduleHour(Number(e.target.value))
                              }
                              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                            >
                              {Array.from({ length: 12 }, (_, i) => i + 1).map(
                                (h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              Minute
                            </label>
                            <select
                              value={scheduleMinute}
                              onChange={(e) =>
                                setScheduleMinute(Number(e.target.value))
                              }
                              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                            >
                              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(
                                (m) => (
                                  <option key={m} value={m}>
                                    {String(m).padStart(2, "0")}
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              AM / PM
                            </label>
                            <select
                              value={scheduleAmPm}
                              onChange={(e) =>
                                setScheduleAmPm(e.target.value as "AM" | "PM")
                              }
                              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                            >
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <div className="mr-auto">
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              Timezone
                            </label>
                            <select
                              value={scheduleTimezone}
                              onChange={(e) =>
                                setScheduleTimezone(e.target.value)
                              }
                              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                            >
                              {TIMEZONES.map((tz) => (
                                <option key={tz} value={tz}>
                                  {tz}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Button
                            size="sm"
                            disabled={scheduleBusy || !scheduleDate}
                            onClick={() => scheduleVersion(version)}
                          >
                            {scheduleBusy
                              ? "Scheduling..."
                              : "Confirm Schedule"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSchedulingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          The post is saved to your Queue as SCHEDULED and
                          publishes automatically at this time.
                        </p>
                      </div>
                    )}

                    {/* Rejection */}
                    {rejectingVersion === version.id ? (
                      <div className="flex gap-1 items-center">
                        {REJECTION_REASONS.map((r) => (
                          <Button
                            key={r.value}
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              rejectVersion(version.id, r.value)
                            }
                          >
                            {r.label}
                          </Button>
                        ))}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRejectingVersion(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-gray-500"
                        onClick={() => setRejectingVersion(version.id)}
                      >
                        ✕ Discard
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
