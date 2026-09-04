"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { parseLinkedInProfileUrl } from "@/lib/profile-review/url-parser";
import type { ProfileReviewResult, ProfileReviewRecommendation } from "@/types";
import { trackEvent } from "@/lib/monitoring/analytics";

// ─── Loading steps ─────────────────────────────────────────────

const ANALYSIS_STEPS = [
  "Collecting available profile information…",
  "Normalizing the profile…",
  "Running NLP analysis…",
  "Running AI analysis…",
  "Generating recommendations…",
  "Calculating profile scores…",
  "Generating final report…",
];

type Stage = "idle" | "needs_content" | "analyzing" | "done";
type FallbackMode = "options" | "paste" | "fields" | "pdf";

interface NeedsContentResponse {
  success: boolean;
  status: "retrieval_failed";
  profileUrl: string;
  username: string;
  errorDetail: string | null;
  message: string;
  options: string[];
}

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW: "bg-blue-100 text-blue-800 border-blue-200",
};

const BAND_STYLES: Record<string, string> = {
  strong: "text-green-700 bg-green-50 border-green-200",
  needsImprovement: "text-amber-700 bg-amber-50 border-amber-200",
  critical: "text-red-700 bg-red-50 border-red-200",
};

function ScoreRing({ score, size = 168 }: { score: number; size?: number }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`Profile score ${score} out of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-4xl font-bold" style={{ color }}>{score}</div>
        <div className="text-xs text-gray-500">/ 100</div>
      </div>
    </div>
  );
}

function ScoreBars({ result }: { result: ProfileReviewResult }) {
  return (
    <div className="space-y-3">
      {result.categories.map((cat) => (
        <div key={cat.key}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-medium">{cat.label}</span>
            <span className="text-gray-600">
              {cat.score}<span className="text-gray-400 text-xs"> / 100</span>
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={cat.score} aria-valuemin={0} aria-valuemax={100} aria-label={`${cat.label} score`}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${cat.score}%`,
                backgroundColor: cat.score >= 75 ? "#16a34a" : cat.score >= 50 ? "#d97706" : "#dc2626",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecommendationCard({ rec, onCopy }: { rec: ProfileReviewRecommendation; onCopy: (r: ProfileReviewRecommendation) => void }) {
  return (
    <Card className="mb-4">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{rec.categoryLabel}</Badge>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${PRIORITY_STYLES[rec.priority]}`}>
              {rec.priority} PRIORITY
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => onCopy(rec)}>
            Copy
          </Button>
        </div>
        <p className="font-medium mb-1">{rec.problem}</p>
        <p className="text-sm text-gray-600 mb-1">
          <strong className="text-gray-800">Why it matters: </strong>{rec.why}
        </p>
        <p className="text-sm text-gray-600 mb-2">
          <strong className="text-gray-800">Recommended: </strong>{rec.recommendation}
        </p>
        {rec.example && (
          <p className="text-sm bg-gray-50 border border-gray-200 rounded-md p-3 text-gray-700">
            <strong>Example: </strong>{rec.example}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-bold mb-3">{children}</h3>;
}

// ─── Main component ────────────────────────────────────────────

export default function ReviewTool() {
  const [profileUrl, setProfileUrl] = useState("");
  const [error, setError] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [fallback, setFallback] = useState<NeedsContentResponse | null>(null);
  const [fallbackMode, setFallbackMode] = useState<FallbackMode>("options");
  const [pasteText, setPasteText] = useState("");
  const [fields, setFields] = useState({ headline: "", about: "", experience: "", skills: "" });
  const [pdfError, setPdfError] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState<ProfileReviewResult | null>(null);
  const [message, setMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [savingDna, setSavingDna] = useState(false);
  const [headlineDrafts, setHeadlineDrafts] = useState<Record<string, string>>({});
  const [aboutDraft, setAboutDraft] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch("/api/auth/get-session")
      .then((r) => r.json())
      .then((s) => setIsAuthenticated(!!s?.user?.id))
      .catch(() => setIsAuthenticated(false));
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (stage === "analyzing") {
      setStepIndex(0);
      stepTimerRef.current = setInterval(() => {
        setStepIndex((i) => Math.min(i + 1, ANALYSIS_STEPS.length - 1));
      }, 400);
    }
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, [stage]);

  const copy = useCallback((text: string, eventName?: Parameters<typeof trackEvent>[0]) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    if (eventName) trackEvent(eventName);
    setMessage("Copied to clipboard!");
    setTimeout(() => setMessage(""), 2500);
  }, []);

  const finishWithResult = (data: any) => {
    const result = (data.result ?? data.analysis) as ProfileReviewResult;
    setResult(result);
    const s = result.suggestions as Record<string, any>;
    const headlineOpts = s.headline?.options || {};
    setHeadlineDrafts({
      professional: headlineOpts.professional || "",
      personalBrand: headlineOpts.personalBrand || "",
      authorityCreator: headlineOpts.authorityCreator || "",
    });
    setAboutDraft(typeof s.about?.suggestion === "string" ? s.about.suggestion : typeof s.aboutSuggestion === "string" ? s.aboutSuggestion : "");
    setStage("done");
    requestAnimationFrame(() => {
      document.getElementById("profile-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const startAnalysis = async () => {
    setError("");
    setMessage("");
    setResult(null);
    setFallback(null);
    setPdfError("");

    let parsed;
    try {
      parsed = parseLinkedInProfileUrl(profileUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please enter a valid LinkedIn profile URL.");
      return;
    }

    setStage("analyzing");
    try {
      const res = await fetch("/api/linkedin-profile/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileUrl: parsed.input }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Analysis failed. Please try again.");
        setStage("idle");
        return;
      }

      if (data.status === "retrieval_failed") {
        setFallback(data as NeedsContentResponse);
        setFallbackMode("options");
        setStage("needs_content");
        return;
      }

      finishWithResult(data);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setStage("idle");
    }
  };

  const submitContent = async () => {
    setError("");
    setMessage("");
    if (fallbackMode === "paste" && pasteText.trim().length < 20) {
      setError("Please paste at least a few sentences of your profile.");
      return;
    }
    if (fallbackMode === "fields" && !fields.headline.trim() && !fields.about.trim() && !fields.experience.trim() && !fields.skills.trim()) {
      setError("Fill in at least one section of your profile.");
      return;
    }

    setStage("analyzing");
    try {
      const payload =
        fallbackMode === "paste"
          ? { content: pasteText, profileUrl: fallback?.profileUrl }
          : {
              content: [
                fields.headline.trim() ? `Headline: ${fields.headline.trim()}` : "",
                fields.about.trim() ? `About:\n${fields.about.trim()}` : "",
                fields.experience.trim() ? `Experience:\n${fields.experience.trim()}` : "",
                fields.skills.trim() ? `Skills: ${fields.skills.trim()}` : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
              profileUrl: fallback?.profileUrl,
            };

      const res = await fetch("/api/tools/linkedin-profile-review/analyze-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Analysis failed. Please try again.");
        setStage("needs_content");
        return;
      }
      finishWithResult(data);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setStage("needs_content");
    }
  };

  const submitPdf = async (file: File) => {
    setError("");
    setPdfError("");
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setPdfError("Only PDF files are supported.");
      return;
    }
    setStage("analyzing");
    try {
      const form = new FormData();
      form.append("file", file);
      if (fallback?.profileUrl) form.append("profileUrl", fallback.profileUrl);

      const res = await fetch("/api/tools/linkedin-profile-review/upload-pdf", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Could not read this PDF. Please paste your profile content instead.");
        setStage("needs_content");
        setFallbackMode("options");
        return;
      }
      finishWithResult(data);
    } catch {
      setError("An unexpected error occurred while reading the PDF.");
      setStage("needs_content");
      setFallbackMode("options");
    }
  };

  const saveProfileSignals = async () => {
    if (!result) return;
    setSavingDna(true);
    setError("");
    try {
      const res = await fetch("/api/tools/linkedin-profile-review/voice-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: result.analysisId || undefined,
          profileData: result.profileData,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(data.data?.message || "Profile intelligence saved!");
        trackEvent({ event: "voice_dna_created", source: "profile_review" });
      } else {
        setError(data.error || "Could not save profile intelligence.");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setSavingDna(false);
    }
  };

  const reset = () => {
    setStage("idle");
    setResult(null);
    setFallback(null);
    setError("");
    setMessage("");
    setPdfError("");
    setPasteText("");
    setFields({ headline: "", about: "", experience: "", skills: "" });
  };

  const suggestions = (result?.suggestions || {}) as Record<string, any>;
  const intel = result?.intelligence;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {message && (
        <div role="status" aria-live="polite" className="mb-4 bg-blue-50 text-blue-800 text-sm p-3 rounded-lg border border-blue-200">
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="mb-4 bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* ── Input card ── */}
      {stage === "idle" && (
        <Card className="border-gray-200 shadow-lg">
          <CardContent className="p-6 sm:p-8">
            <label htmlFor="profile-url" className="block text-sm font-semibold mb-2">
              LinkedIn Profile:
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                id="profile-url"
                type="text"
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startAnalysis()}
                placeholder="@username or https://www.linkedin.com/in/yourname"
                className="h-12 flex-1 text-base"
                autoComplete="off"
              />
              <Button
                onClick={startAnalysis}
                className="h-12 px-8 text-base font-semibold bg-orange-500 hover:bg-orange-600 text-white shrink-0"
              >
                Analyze My Profile
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Free AI-powered analysis — no account required. 3 free analyses per day.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Retrieval failed / fallback options ── */}
      {stage === "needs_content" && fallback && (
        <div className="text-left">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-900">
            <p className="font-medium mb-1">
              Profile found: <span className="font-semibold">{fallback.username}</span>
            </p>
            <p>{fallback.message}</p>
            {fallback.errorDetail && <p className="text-xs text-amber-700 mt-1">({fallback.errorDetail})</p>}
          </div>

          {fallbackMode === "options" && (
            <div className="mb-4">
              <p className="text-sm font-semibold mb-3">Choose an option:</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <button
                  onClick={() => setFallbackMode("paste")}
                  className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all"
                >
                  <p className="font-medium text-sm mb-1">📋 Paste content</p>
                  <p className="text-xs text-gray-500">Paste your headline, About, experience, and skills.</p>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all"
                >
                  <p className="font-medium text-sm mb-1">📄 Upload PDF</p>
                  <p className="text-xs text-gray-500">Upload your LinkedIn profile PDF export.</p>
                </button>
                <Link
                  href="/settings/integrations"
                  className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all block"
                >
                  <p className="font-medium text-sm mb-1">🔗 Connect LinkedIn</p>
                  <p className="text-xs text-gray-500">Sign in and connect for automatic publishing later.</p>
                </Link>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) submitPdf(f);
                }}
              />
              {pdfError && <p className="text-xs text-red-600 mt-2">{pdfError}</p>}
              <p className="text-xs text-gray-400 mt-3">Note: LinkedIn doesn&apos;t allow automated retrieval of public profiles, so we analyze exactly what you supply — never scraped, never fabricated.</p>
              <div className="mt-4">
                <Button variant="outline" onClick={reset}>← Back</Button>
              </div>
            </div>
          )}

          {fallbackMode === "paste" || fallbackMode === "fields" ? (
            <>
              <div className="flex gap-2 mb-4" role="tablist" aria-label="Input method">
                <button
                  role="tab"
                  aria-selected={fallbackMode === "paste"}
                  onClick={() => setFallbackMode("paste")}
                  className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                    fallbackMode === "paste" ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 hover:border-gray-900"
                  }`}
                >
                  Paste profile content
                </button>
                <button
                  role="tab"
                  aria-selected={fallbackMode === "fields"}
                  onClick={() => setFallbackMode("fields")}
                  className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                    fallbackMode === "fields" ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 hover:border-gray-900"
                  }`}
                >
                  Enter sections manually
                </button>
              </div>

              {fallbackMode === "paste" ? (
                <Card className="border-gray-200">
                  <CardContent className="p-6">
                    <label htmlFor="profile-paste" className="block text-sm font-semibold mb-2">
                      Paste your LinkedIn profile content
                    </label>
                    <Textarea
                      id="profile-paste"
                      rows={10}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder={"Paste your profile here — headline, About, experience, skills.\n\nTip: you can label sections like:\nHeadline: …\nAbout: …\nExperience: …\nSkills: …"}
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button onClick={submitContent} className="bg-orange-500 hover:bg-orange-600 text-white">
                        Analyze My Profile
                      </Button>
                      <Button variant="outline" onClick={() => setFallbackMode("options")}>Back</Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-gray-200">
                  <CardContent className="p-6 space-y-4">
                    <div>
                      <label htmlFor="f-headline" className="block text-sm font-medium mb-1">Headline</label>
                      <Input id="f-headline" value={fields.headline} onChange={(e) => setFields({ ...fields, headline: e.target.value })} placeholder="e.g. Software Engineer | AI & SaaS" />
                    </div>
                    <div>
                      <label htmlFor="f-about" className="block text-sm font-medium mb-1">About</label>
                      <Textarea id="f-about" rows={5} value={fields.about} onChange={(e) => setFields({ ...fields, about: e.target.value })} placeholder="Paste your About section…" />
                    </div>
                    <div>
                      <label htmlFor="f-experience" className="block text-sm font-medium mb-1">Experience</label>
                      <Textarea id="f-experience" rows={5} value={fields.experience} onChange={(e) => setFields({ ...fields, experience: e.target.value })} placeholder={"Company / Role / Dates\n• Achievement bullet\n• Another bullet"} />
                    </div>
                    <div>
                      <label htmlFor="f-skills" className="block text-sm font-medium mb-1">Skills (comma-separated)</label>
                      <Input id="f-skills" value={fields.skills} onChange={(e) => setFields({ ...fields, skills: e.target.value })} placeholder="React, TypeScript, Product Strategy…" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={submitContent} className="bg-orange-500 hover:bg-orange-600 text-white">
                        Analyze My Profile
                      </Button>
                      <Button variant="outline" onClick={() => setFallbackMode("options")}>Back</Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ── Analyzing ── */}
      {stage === "analyzing" && (
        <div className="py-8" role="status" aria-live="polite" aria-busy="true">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-6 h-6 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
            <h2 className="text-xl font-semibold">Analyzing your LinkedIn profile…</h2>
          </div>
          <ol className="max-w-md mx-auto space-y-2 text-left">
            {ANALYSIS_STEPS.map((step, i) => (
              <li
                key={step}
                className={`flex items-center gap-3 text-sm rounded-lg px-3 py-2 transition-colors ${
                  i < stepIndex ? "text-gray-500" : i === stepIndex ? "text-gray-900 bg-blue-50 border border-blue-100" : "text-gray-400"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0 ${
                    i < stepIndex ? "bg-green-100 text-green-700" : i === stepIndex ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {i < stepIndex ? "✓" : i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Report ── */}
      {stage === "done" && result && (
        <div id="profile-report" className="text-left space-y-8">
          {/* Score header */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-lg text-center">
            <h2 className="text-2xl font-bold mb-1">Your LinkedIn Profile Score</h2>
            {result.identity?.name && <p className="text-sm text-gray-500 mb-1">{result.identity.name}</p>}
            <div className="flex justify-center my-4">
              <ScoreRing score={result.overallScore} />
            </div>
            <Badge className={`${BAND_STYLES[result.band.key] || ""} text-sm px-3 py-1 mb-3`}>
              {result.band.label} Profile
            </Badge>
            <p className="text-gray-600 max-w-lg mx-auto">{result.summaryLine}</p>

            {result.dataSource?.partial && result.dataSource.notice && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mt-4">
                {result.dataSource.notice}
              </p>
            )}
            {!result.usedAi && result.aiNotice && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mt-4">
                {result.aiNotice}
              </p>
            )}
            {result.profileUrl && (
              <p className="text-xs text-gray-400 mt-3">
                Analyzed: <span className="font-mono">{result.profileUrl}</span>
                {result.dataSource?.source && <span> · source: {result.dataSource.source}</span>}
                {result.dataSource?.retrievedAt && <span> · retrieved {new Date(result.dataSource.retrievedAt).toLocaleString()}</span>}
              </p>
            )}
          </div>

          {/* Executive summary (AI, when available) */}
          {suggestions.executiveSummary && (
            <section aria-label="Executive summary">
              <SectionHeading>Executive Summary</SectionHeading>
              <Card className="border-gray-200">
                <CardContent className="p-6 text-sm text-gray-700 leading-relaxed">
                  {suggestions.executiveSummary}
                </CardContent>
              </Card>
            </section>
          )}

          {/* Strengths & weaknesses */}
          {(suggestions.biggestStrengths?.length || suggestions.biggestWeaknesses?.length) ? (
            <section aria-label="Strengths and weaknesses">
              <div className="grid sm:grid-cols-2 gap-4">
                <Card className="border-green-200">
                  <CardContent className="p-5">
                    <p className="text-sm font-semibold text-green-800 mb-2">Biggest Strengths</p>
                    <ul className="space-y-1.5 text-sm text-gray-600">
                      {(suggestions.biggestStrengths || []).map((s: string, i: number) => <li key={i}>• {s}</li>)}
                    </ul>
                  </CardContent>
                </Card>
                <Card className="border-red-200">
                  <CardContent className="p-5">
                    <p className="text-sm font-semibold text-red-800 mb-2">Biggest Weaknesses</p>
                    <ul className="space-y-1.5 text-sm text-gray-600">
                      {(suggestions.biggestWeaknesses || []).map((s: string, i: number) => <li key={i}>• {s}</li>)}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </section>
          ) : null}

          {/* Category scores */}
          <section aria-label="Category scores">
            <SectionHeading>Category Scores</SectionHeading>
            <Card className="border-gray-200">
              <CardContent className="p-6">
                <ScoreBars result={result} />
              </CardContent>
            </Card>
          </section>

          {/* Top 5 improvements */}
          <section aria-label="Top 5 improvements">
            <SectionHeading>Top 5 Improvements</SectionHeading>
            <Card className="border-gray-200">
              <CardContent className="p-6">
                <ol className="space-y-3">
                  {result.topRecommendations.map((rec, i) => (
                    <li key={rec.id} className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold shrink-0">{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{rec.problem}</p>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${PRIORITY_STYLES[rec.priority]}`}>{rec.priority}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{rec.categoryLabel} · {rec.recommendation}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </section>

          {/* Headline analysis */}
          {result.profileData.headline && (
            <section aria-label="Headline analysis">
              <SectionHeading>Headline</SectionHeading>
              <Card className="border-gray-200 mb-4">
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-gray-500 mb-1">Current headline</p>
                  <p className="font-medium mb-4">“{result.profileData.headline}”</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium mb-2">Problems detected</p>
                      <ul className="space-y-2 text-sm text-gray-600">
                        {result.sections.headline.issues.length > 0 ? (
                          result.sections.headline.issues.map((iss: any, i: number) => <li key={i}>• {iss.problem}</li>)
                        ) : (
                          <li>• No significant problems detected.</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Strengths</p>
                      <ul className="space-y-2 text-sm text-gray-600">
                        {result.sections.headline.strengths.map((s: string, i: number) => <li key={i}>• {s}</li>)}
                      </ul>
                    </div>
                  </div>
                  {suggestions.headline?.analysis && (
                    <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3 mt-4">
                      <strong>AI analysis: </strong>{suggestions.headline.analysis}
                    </p>
                  )}
                </CardContent>
              </Card>

              {suggestions.headline?.options && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Improved headline options (editable)</p>
                  {[
                    { label: "Professional", key: "professional" },
                    { label: "Personal Brand", key: "personalBrand" },
                    { label: "Authority / Creator", key: "authorityCreator" },
                  ].map((opt) => {
                    const original: string = suggestions.headline.options[opt.key] || "";
                    if (!original) return null;
                    const value = headlineDrafts[opt.key] ?? original;
                    return (
                      <Card key={opt.key} className="border-blue-200 bg-blue-50/40">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">{opt.label}</p>
                            <Button size="sm" variant="outline" onClick={() => copy(value, { event: "headline_generated" })}>Copy</Button>
                          </div>
                          <Textarea
                            aria-label={`${opt.label} headline option`}
                            value={value}
                            onChange={(e) => setHeadlineDrafts({ ...headlineDrafts, [opt.key]: e.target.value })}
                            rows={2}
                            className="bg-white text-sm"
                          />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* About */}
          {result.profileData.about && (
            <section aria-label="About section analysis">
              <SectionHeading>About</SectionHeading>
              <Card className="border-gray-200 mb-4">
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-gray-500 mb-1">Current About</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line max-h-40 overflow-y-auto mb-4">{result.profileData.about}</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium mb-2">What is missing</p>
                      <ul className="space-y-2 text-sm text-gray-600">
                        {result.sections.about.issues.length > 0 ? (
                          result.sections.about.issues.map((iss: any, i: number) => <li key={i}>• {iss.problem}</li>)
                        ) : (
                          <li>• Looking strong — no major gaps found.</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Analysis</p>
                      <ul className="space-y-2 text-sm text-gray-600">
                        {result.sections.about.strengths.map((s: string, i: number) => <li key={i}>• {s}</li>)}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {suggestions.about?.suggestion && (
                <Card className="border-blue-200 bg-blue-50/40">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-blue-900">Improved About (editable)</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => copy(aboutDraft, { event: "about_generated" })}>Copy</Button>
                        <Button size="sm" onClick={() => copy(aboutDraft, { event: "about_generated" })}>Use</Button>
                      </div>
                    </div>
                    <Textarea aria-label="Improved About section" value={aboutDraft} onChange={(e) => setAboutDraft(e.target.value)} rows={6} className="bg-white" />
                  </CardContent>
                </Card>
              )}
            </section>
          )}

          {/* Experience */}
          {(result.sections.positions?.length > 0 || result.profileData.experience) && (
            <section aria-label="Experience analysis">
              <SectionHeading>Experience</SectionHeading>

              {result.sections.positions.length > 0 ? (
                <div className="space-y-4">
                  {result.sections.positions.map((pos: any, i: number) => (
                    <Card key={i} className="border-gray-200">
                      <CardContent className="p-6">
                        <p className="font-semibold mb-0.5">{pos.role || "Role"} {pos.company ? <span className="text-gray-500 font-normal">· {pos.company}</span> : null}</p>
                        {pos.duration && <p className="text-xs text-gray-400 mb-3">{pos.duration}</p>}
                        <div className="grid sm:grid-cols-3 gap-4">
                          <div>
                            <p className="text-sm font-medium text-green-800 mb-1.5">Strengths</p>
                            <ul className="space-y-1.5 text-sm text-gray-600">
                              {pos.strengths.length ? pos.strengths.map((s: string, j: number) => <li key={j}>• {s}</li>) : <li>• None detected</li>}
                            </ul>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-red-800 mb-1.5">Weaknesses</p>
                            <ul className="space-y-1.5 text-sm text-gray-600">
                              {pos.weaknesses.length ? pos.weaknesses.map((s: string, j: number) => <li key={j}>• {s}</li>) : <li>• None detected</li>}
                            </ul>
                          </div>
                          <div>
                            <p className="text-sm font-medium mb-1.5">Recommended improvements</p>
                            <ul className="space-y-1.5 text-sm text-gray-600">
                              {pos.recommendations.length ? pos.recommendations.map((s: string, j: number) => <li key={j}>• {s}</li>) : <li>• Looks solid</li>}
                            </ul>
                          </div>
                        </div>
                        {pos.missingInfo?.length > 0 && (
                          <p className="text-xs text-amber-700 mt-3">Missing: {pos.missingInfo.join(", ")}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-gray-200">
                  <CardContent className="p-6">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-2">Strong points</p>
                        <ul className="space-y-2 text-sm text-gray-600">
                          {result.sections.experience.strengths.map((s: string, i: number) => <li key={i}>• {s}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">Weak points</p>
                        <ul className="space-y-2 text-sm text-gray-600">
                          {result.sections.experience.issues.map((iss: any, i: number) => <li key={i}>• {iss.problem}</li>)}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {Array.isArray(suggestions.experience) && suggestions.experience.length > 0 && (
                <div className="mt-3 space-y-2">
                  {(suggestions.experience as any[]).map((e: any, i: number) => (
                    e?.recommendations?.length ? (
                      <div key={i} className="text-sm bg-gray-50 border border-gray-200 rounded-md p-3 text-gray-700">
                        <strong>{e.role || "Role"}{e.company ? ` · ${e.company}` : ""}: </strong>
                        {e.recommendations.join(" ")}
                      </div>
                    ) : null
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Skills */}
          <section aria-label="Skills analysis">
            <SectionHeading>Skills</SectionHeading>
            <Card className="border-gray-200">
              <CardContent className="p-6">
                <p className="text-sm font-medium mb-2">Existing skills ({result.profileData.skills.length})</p>
                {result.profileData.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-5">
                    {result.profileData.skills.map((s: string) => <Badge key={s} variant="secondary">{s}</Badge>)}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 mb-5">No skills provided.</p>
                )}
                {suggestions.skills?.analysis && (
                  <p className="text-sm text-gray-600 mb-4">{suggestions.skills.analysis}</p>
                )}
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-medium mb-2">Missing / recommended skills</p>
                    <div className="flex flex-wrap gap-2">
                      {[...(suggestions.skills?.missing || []), ...(suggestions.skills?.recommended || [])].slice(0, 10).map((s: string, i: number) => (
                        <Badge key={i} className="bg-blue-50 text-blue-800 border-blue-200">{s}</Badge>
                      ))}
                      {!suggestions.skills?.missing?.length && !suggestions.skills?.recommended?.length && (
                        <p className="text-sm text-gray-500">Add skills that match your headline keywords.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Missing keywords</p>
                    <div className="flex flex-wrap gap-2">
                      {result.sections.keywords.missingKeywords.slice(0, 8).map((k: string) => (
                        <Badge key={k} variant="warning">{k}</Badge>
                      ))}
                      {result.sections.keywords.missingKeywords.length === 0 && <p className="text-sm text-gray-500">Good coverage — no gaps found.</p>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Keywords */}
          <section aria-label="Keyword analysis">
            <SectionHeading>Keywords</SectionHeading>
            <Card className="border-gray-200">
              <CardContent className="p-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-medium mb-2">Primary keywords</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {(suggestions.keywords?.primary || intel?.keywordClusters?.[0]?.keywords || result.sections.keywords.keywords.slice(0, 5)).map((k: string, i: number) => (
                        <Badge key={i} className="bg-gray-900 text-white">{k}</Badge>
                      ))}
                    </div>
                    <p className="text-sm font-medium mb-2">Secondary keywords</p>
                    <div className="flex flex-wrap gap-2">
                      {(suggestions.keywords?.secondary || intel?.keywordClusters?.[1]?.keywords || []).map((k: string, i: number) => (
                        <Badge key={i} variant="secondary">{k}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Missing keywords</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {(suggestions.keywords?.missing || []).length > 0
                        ? (suggestions.keywords.missing as string[]).slice(0, 8).map((k: string, i: number) => <Badge key={i} variant="warning">{k}</Badge>)
                        : <p className="text-sm text-gray-500">No gaps identified.</p>}
                    </div>
                    {intel?.keywordClusters && (
                      <>
                        <p className="text-sm font-medium mb-2">Keyword clusters</p>
                        <div className="space-y-2">
                          {intel.keywordClusters.map((c) => (
                            <div key={c.cluster} className="text-xs text-gray-600">
                              <strong>{c.cluster}: </strong>{c.keywords.join(", ")}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Personal brand */}
          <section aria-label="Personal brand analysis">
            <SectionHeading>Personal Brand</SectionHeading>
            <Card className="border-gray-200">
              <CardContent className="p-6">
                {suggestions.personalBrand?.analysis && <p className="text-sm text-gray-600 mb-4">{suggestions.personalBrand.analysis}</p>}
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-medium mb-2">Brand themes</p>
                    <ul className="space-y-1.5 text-sm text-gray-600">
                      {(intel?.brandThemes || result.sections.personalBrand.strengths || []).map((s: string, i: number) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Positioning</p>
                    <p className="text-sm text-gray-600 mb-3">{intel?.positioning || "Unknown positioning"}</p>
                    <p className="text-sm font-medium mb-2">Potential audience</p>
                    <p className="text-sm text-gray-600">{intel?.potentialAudience || "Not clearly stated in the profile."}</p>
                  </div>
                </div>
                {suggestions.personalBrand?.recommendations?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Recommendations</p>
                    <ul className="space-y-1.5 text-sm text-gray-600">
                      {(suggestions.personalBrand.recommendations as string[]).map((s: string, i: number) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Content strategy */}
          <section aria-label="Content strategy">
            <SectionHeading>Content Strategy</SectionHeading>
            <Card className="border-gray-200">
              <CardContent className="p-6">
                <p className="text-sm font-medium mb-2">Content pillars</p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {(suggestions.contentPillars?.length ? suggestions.contentPillars : intel?.contentPillars || []).map((p: string, i: number) => (
                    <Badge key={i} className="bg-purple-50 text-purple-800 border-purple-200">{p}</Badge>
                  ))}
                </div>
                <p className="text-sm font-medium mb-2">10 content ideas for your first posts</p>
                <ol className="space-y-2">
                  {(suggestions.contentIdeas?.length ? suggestions.contentIdeas : intel?.contentIdeas || []).map((idea: string, i: number) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                      <span className="text-blue-600 font-bold shrink-0">{i + 1}.</span>
                      <span>{idea}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </section>

          {/* 30-day plan */}
          <section aria-label="30 day optimization plan">
            <SectionHeading>30-Day Optimization Plan</SectionHeading>
            <div className="space-y-3">
              {(intel?.thirtyDayPlan || []).map((week: any) => (
                <Card key={week.week} className="border-gray-200">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-white bg-blue-600 rounded px-2 py-0.5">{week.week}</span>
                      <p className="font-semibold text-sm">{week.focus}</p>
                    </div>
                    <ul className="space-y-1.5">
                      {week.actions.map((a: string, i: number) => (
                        <li key={i} className="text-sm text-gray-600 flex gap-2"><span className="text-green-600">✓</span><span>{a}</span></li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* All recommendations */}
          <section aria-label="All recommendations">
            <SectionHeading>All Recommendations</SectionHeading>
            {result.recommendations.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} onCopy={(r) => copy(`${r.problem}\n${r.recommendation}${r.example ? `\nExample: ${r.example}` : ""}`, { event: "recommendation_copied", category: r.category })} />
            ))}
          </section>

          {/* Voice DNA conversion */}
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
            <CardContent className="p-6 text-center">
              <h3 className="text-xl font-bold mb-1">Create My Voice DNA</h3>
              <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">
                Use this profile analysis to seed your professional identity, expertise, and keywords — then pair it
                with your writing style for posts that sound like you.
              </p>
              {isAuthenticated ? (
                <Button onClick={saveProfileSignals} disabled={savingDna}>
                  {savingDna ? "Saving…" : "Use this profile to build my Voice DNA"}
                </Button>
              ) : (
                <div>
                  <Link href="/signup"><Button>Create free account to save profile intelligence</Button></Link>
                  <p className="text-xs text-gray-400 mt-2">
                    Already have an account? <Link href="/login" className="text-blue-600 hover:underline">Log in</Link>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lead generation */}
          <div className="bg-gray-900 text-white rounded-2xl p-6 sm:p-8 text-center">
            <h3 className="text-xl font-bold mb-1">Ready to grow your LinkedIn presence?</h3>
            <p className="text-sm text-gray-300 mb-5">
              Generate on-brand posts, schedule them, and publish directly to LinkedIn.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/voice-dna"><Button className="bg-white text-gray-900 hover:bg-gray-100">Create My Voice DNA</Button></Link>
              <Link href="/create/ai-post"><Button variant="outline" className="border-gray-600 text-white hover:bg-gray-800">Create LinkedIn Posts</Button></Link>
              <Link href="/content/ideas"><Button variant="outline" className="border-gray-600 text-white hover:bg-gray-800">Generate Content Ideas</Button></Link>
              <Link href="/settings/integrations"><Button variant="outline" className="border-gray-600 text-white hover:bg-gray-800">Connect LinkedIn</Button></Link>
              <Link href="/calendar"><Button variant="outline" className="border-gray-600 text-white hover:bg-gray-800">Schedule My Posts</Button></Link>
            </div>
          </div>

          <div className="text-center">
            <Button variant="ghost" onClick={reset}>← Analyze another profile</Button>
          </div>
        </div>
      )}
    </div>
  );
}