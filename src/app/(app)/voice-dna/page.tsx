"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface NLPProfile {
  sentenceStructure: {
    avgSentenceLength: number;
    sentenceLengthVariety: number;
    shortSentences: number;
    mediumSentences: number;
    longSentences: number;
    fragmentUsage: number;
    questionRatio: number;
    exclamationRatio: number;
    avgClausesPerSentence: number;
  };
  vocabulary: {
    avgWordLength: number;
    avgSyllablesPerWord: number;
    uniqueWordRatio: number;
    repetitionPatterns: string[];
    powerWords: string[];
    fillerWords: string[];
    technicalLevel: string;
    preferredTransitions: string[];
  };
  punctuation: {
    periodStyle: string;
    exclamationStyle: string;
    ellipsisUsage: number;
    dashUsage: number;
    commaStyle: string;
    colonUsage: number;
    semicolonUsage: number;
    quoteStyle: string;
  };
  paragraphStructure: {
    avgParagraphLength: number;
    singleSentenceParagraphs: number;
    lineBreakFrequency: number;
    formattingStyle: string;
    bulletListUsage: number;
    numberedListUsage: number;
    boldUsage: number;
  };
  hookPatterns: {
    primaryHookTypes: string[];
    avgHookLength: number;
    hookCharacteristics: string[];
    openingPatterns: string[];
    hookToBodyTransition: string;
  };
  tone: {
    formalityScore: number;
    confidenceScore: number;
    warmthScore: number;
    authorityScore: number;
    directnessScore: number;
    humorScore: number;
    emotionalRange: string[];
    voiceArchetype: string;
  };
  storytelling: {
    preferredStructures: string[];
    narrativeStyle: string;
    evidenceStyle: string;
    ctaStyle: string;
    ctaFrequency: number;
    avgPostLength: string;
    wordCountRange: { min: number; max: number; avg: number };
  };
  formatting: {
    emojiFrequency: number;
    emojiTypes: string[];
    hashtagStyle: string;
    hashtagPlacement: string;
    capitalization: string;
    numberStyle: string;
  };
  emotionalFingerprint: {
    primaryEmotions: string[];
    emotionalIntensity: string;
    vulnerabilityLevel: number;
    inspirationStyle: string;
    connectionStyle: string;
  };
  consistency: {
    voiceConsistencyScore: number;
    sampleSize: number;
    confidenceLevel: string;
    improvementAreas: string[];
  };
}

interface VoiceProfile {
  id: string;
  version: number;
  confidenceScore: number;
  sampleCount: number;
  userConfirmed: boolean;
  tone: string[];
  sentenceStyle: string | null;
  paragraphStyle: string | null;
  hookPatterns: string[];
  ctaStyle: string | null;
  emojiUsage: string | null;
  commonTopics: string[];
  wordsToAvoid: string[];
  nlpProfile: NLPProfile | null;
}

interface WritingSample {
  id: string;
  content: string;
  source: string | null;
  sourceType: string | null;
  weight: number;
  createdAt: string;
}

function confidenceTier(score: number): string {
  if (score < 0.4) return "Emerging";
  if (score < 0.7) return "Solid";
  return "Strong";
}

function confidenceColor(score: number): string {
  if (score < 0.4) return "bg-yellow-100 text-yellow-800";
  if (score < 0.7) return "bg-blue-100 text-blue-800";
  return "bg-green-100 text-green-800";
}

const SOURCE_OPTIONS = [
  { value: "linkedin_post", label: "LinkedIn Post" },
  { value: "blog", label: "Blog Post" },
  { value: "email", label: "Email" },
  { value: "slack", label: "Slack Message" },
  { value: "other", label: "Other Writing" },
];

export default function VoiceDnaPage() {
  const [nlpTab, setNlpTab] = useState<string>('tone');
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [samples, setSamples] = useState<WritingSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [newSample, setNewSample] = useState("");
  const [newSampleSource, setNewSampleSource] = useState("linkedin_post");
  const [showConfirm, setShowConfirm] = useState(false);
  const [rating, setRating] = useState<"yes" | "somewhat" | "no" | null>(null);
  const [message, setMessage] = useState("");
  const [importingLinkedIn, setImportingLinkedIn] = useState(false);
  const [autoImportAvailable, setAutoImportAvailable] = useState(false);
  const [hasLinkedIn, setHasLinkedIn] = useState(false);
  const autoImportFiredRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const [voiceRes, samplesRes] = await Promise.all([
        fetch("/api/voice"),
        fetch("/api/voice/samples"),
      ]);
      const voiceData = await voiceRes.json();
      const samplesData = await samplesRes.json();
      if (voiceData.success) setVoiceProfile(voiceData.data);
      if (voiceData.meta?.autoImport?.available) {
        setAutoImportAvailable(true);
      }
      setHasLinkedIn(Boolean(voiceData.meta?.autoImport?.hasLinkedIn));
      if (samplesData.success) setSamples(samplesData.data);
    } catch (err) {
      console.error("Failed to fetch Voice DNA data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // First-time user with published posts or a connected LinkedIn account:
  // auto-import their posts (no manual sample adding) the very first time this
  // page loads in the session, so Voice DNA is built from their real content.
  useEffect(() => {
    if (loading || autoImportFiredRef.current) return;
    // Skip when a real (sample-backed) DNA exists; a seeded 0-sample DNA from
    // onboarding should still be refined via auto-import when possible.
    if ((voiceProfile && voiceProfile.sampleCount >= 3) || samples.length >= 3) return;
    if (!autoImportAvailable) return; // nothing to import yet

    autoImportFiredRef.current = true;
    try {
      if (sessionStorage.getItem("voicedna_auto_import_fired") === "1") return;
      sessionStorage.setItem("voicedna_auto_import_fired", "1");
    } catch {
      /* private mode — fine, ref still guards */
    }

    // Only auto-run when there is genuinely something importable. "available"
    // is reported by the server (published posts OR live LinkedIn connection).
    const t = setTimeout(() => {
      importLinkedInPosts(true /* silent */);
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, voiceProfile, samples, autoImportAvailable]);

  const addSample = async () => {
    if (newSample.length < 10) return;
    try {
      const res = await fetch("/api/voice/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newSample,
          source: newSampleSource,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewSample("");
        setMessage(data.message);
        fetchData();
      }
    } catch (err) {
      console.error("Failed to add sample:", err);
    }
  };

  const deleteSample = async (id: string) => {
    try {
      await fetch(`/api/voice/samples/${id}`, { method: "DELETE" });
      fetchData();
    } catch (err) {
      console.error("Failed to delete sample:", err);
    }
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setMessage("");
    try {
      const res = await fetch("/api/voice/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerReason: "manual_reanalyze" }),
      });
      const data = await res.json();
      if (data.success) {
        setVoiceProfile(data.data.voiceProfile);
        setShowConfirm(true);
        const nlpNote = data.data.usedNlpOnly ? " (NLP-only — AI rate-limited)" : "";
        setMessage(`Voice DNA updated! Strength: ${data.data.confidenceTier}${nlpNote}`);
      } else {
        setMessage(data.error || "Analysis failed");
      }
    } catch (err) {
      console.error("Analysis failed:", err);
      setMessage("Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const rateVoice = async (r: "yes" | "somewhat" | "no") => {
    setRating(r);
    try {
      const res = await fetch("/api/voice/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: r }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(data.data.message);
        if (r === "yes") {
          setVoiceProfile((prev) =>
            prev ? { ...prev, userConfirmed: true } : prev
          );
        }
      }
    } catch (err) {
      console.error("Rating failed:", err);
    }
  };

  const importLinkedInPosts = async (silent = false) => {
    setImportingLinkedIn(true);
    if (!silent) setMessage("");
    try {
      const res = await fetch("/api/voice/analyze-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        setVoiceProfile(data.data.voiceProfile);
        setShowConfirm(true);
        setMessage(
          `Imported ${data.data.postsFound} posts! NLP analyzed ${data.data.totalSamples} total samples. ` +
          `New samples added: ${data.data.newSamplesAdded}. Confidence: ${data.data.confidenceTier}`
        );
        fetchData();
      } else if (!silent) {
        setMessage(data.error || "Import failed");
      }
    } catch (err) {
      console.error("LinkedIn import failed:", err);
      if (!silent) setMessage("Import failed. Please try again.");
    } finally {
      setImportingLinkedIn(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse text-gray-400">Loading Voice DNA...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Voice DNA</h1>
          <p className="text-gray-600 mt-1">
            Your unique writing fingerprint, used to personalize all AI output.
          </p>
        </div>
      </div>

      {message && (
        <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded mb-6">
          {message}
        </div>
      )}

      {/* Voice DNA Display */}
      {voiceProfile ? (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Your Voice DNA</CardTitle>
              <div className="flex items-center gap-2">
                <Badge className={confidenceColor(voiceProfile.confidenceScore)}>
                  {confidenceTier(voiceProfile.confidenceScore)} —{" "}
                  {voiceProfile.sampleCount} samples
                </Badge>
                {voiceProfile.userConfirmed && (
                  <Badge variant="success">✓ Confirmed</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Seeded-DNA note: created from onboarding answers, not yet refined */}
            {voiceProfile.sampleCount === 0 && (
              <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded mb-6">
                This Voice DNA was seeded from your onboarding answers. Add at least 3 writing
                samples (or import your published posts) and click{" "}
                <span className="font-medium">Reanalyze</span> to sharpen it from your real writing.
              </div>
            )}

            {/* Basic Voice Summary */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">Tone</p>
                <p className="font-medium">
                  {(() => { const t: any = voiceProfile.tone; if (Array.isArray(t)) return t.join(' · '); if (t?.primary) return `${t.primary}${t.secondary ? ' · ' + t.secondary : ''}`; return String(t || 'Unknown'); })()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Writing Style</p>
                <p className="font-medium">
                  {voiceProfile.paragraphStyle || "Medium"} paragraphs,{" "}
                  {voiceProfile.sentenceStyle || "medium"} sentences
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Hooks</p>
                <p className="font-medium">
                  {(() => { const h: any = voiceProfile.hookPatterns; if (Array.isArray(h)) return h.join(' · '); if (h?.templates) return h.templates.join(' · '); return 'Not yet detected'; })()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Common Topics</p>
                <p className="font-medium">
                  {(() => { const c: any = voiceProfile.commonTopics; if (Array.isArray(c)) return c.join(', '); if (c?.topics) return c.topics.join(', '); return 'Not yet detected'; })()}
                </p>
              </div>
            </div>

            {/* NLP Deep Analysis */}
            {voiceProfile.nlpProfile && (
              <div className="border-t pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-lg font-semibold">NLP Deep Analysis</h3>
                  <Badge className="bg-purple-100 text-purple-800">AI-powered</Badge>
                </div>

                {/* Voice Archetype Banner */}
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">
                      {voiceProfile.nlpProfile.tone.voiceArchetype === 'the expert' ? '🎓' :
                       voiceProfile.nlpProfile.tone.voiceArchetype === 'the storyteller' ? '📖' :
                       voiceProfile.nlpProfile.tone.voiceArchetype === 'the mentor' ? '🧭' :
                       voiceProfile.nlpProfile.tone.voiceArchetype === 'the direct communicator' ? '⚡' :
                       voiceProfile.nlpProfile.tone.voiceArchetype === 'the friend' ? '🤝' : '🔧'}
                    </div>
                    <div>
                      <p className="font-semibold text-lg capitalize">{voiceProfile.nlpProfile.tone.voiceArchetype}</p>
                      <p className="text-sm text-gray-600">Your dominant writing archetype</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-sm text-gray-500">Consistency</p>
                      <p className="font-bold text-lg">{Math.round(voiceProfile.nlpProfile.consistency.voiceConsistencyScore * 100)}%</p>
                    </div>
                  </div>
                </div>

                {/* NLP Tabs */}
                <div className="flex gap-1 mb-4 flex-wrap">
                  {([
                    { key: 'tone', label: '🎯 Tone' },
                    { key: 'sentences', label: '📝 Sentences' },
                    { key: 'vocabulary', label: '📚 Vocabulary' },
                    { key: 'hooks', label: '🪝 Hooks' },
                    { key: 'storytelling', label: '📖 Story' },
                    { key: 'formatting', label: '✨ Format' },
                    { key: 'emotions', label: '❤️ Emotions' },
                  ] as const).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setNlpTab(tab.key)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                        nlpTab === tab.key
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tone Tab */}
                {nlpTab === 'tone' && (
                  <div className="space-y-3">
                    {([
                      { label: 'Formality', value: voiceProfile.nlpProfile.tone.formalityScore, low: 'Casual', high: 'Formal' },
                      { label: 'Confidence', value: voiceProfile.nlpProfile.tone.confidenceScore, low: 'Humble', high: 'Confident' },
                      { label: 'Warmth', value: voiceProfile.nlpProfile.tone.warmthScore, low: 'Analytical', high: 'Warm' },
                      { label: 'Authority', value: voiceProfile.nlpProfile.tone.authorityScore, low: 'Peer-level', high: 'Expert' },
                      { label: 'Directness', value: voiceProfile.nlpProfile.tone.directnessScore, low: 'Indirect', high: 'Direct' },
                      { label: 'Humor', value: voiceProfile.nlpProfile.tone.humorScore, low: 'Serious', high: 'Playful' },
                    ]).map(({ label, value, low, high }) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-20 text-right">{low}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all"
                            style={{ width: `${Math.round(value * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-16">{high}</span>
                        <span className="text-xs font-mono text-gray-400 w-8">{Math.round(value * 100)}%</span>
                      </div>
                    ))}
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 mb-1">Emotional Range</p>
                      <div className="flex gap-1 flex-wrap">
                        {voiceProfile.nlpProfile.tone.emotionalRange.map(e => (
                          <Badge key={e} className="bg-purple-100 text-purple-700 text-xs capitalize">{e}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sentences Tab */}
                {nlpTab === 'sentences' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-blue-600">{voiceProfile.nlpProfile.sentenceStructure.shortSentences}%</p>
                        <p className="text-xs text-gray-500">Short (&lt;8 words)</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-purple-600">{voiceProfile.nlpProfile.sentenceStructure.mediumSentences}%</p>
                        <p className="text-xs text-gray-500">Medium (8-20)</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-orange-600">{voiceProfile.nlpProfile.sentenceStructure.longSentences}%</p>
                        <p className="text-xs text-gray-500">Long (20+)</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Avg sentence length</span><span className="font-medium">{voiceProfile.nlpProfile.sentenceStructure.avgSentenceLength} words</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Fragment usage</span><span className="font-medium">{voiceProfile.nlpProfile.sentenceStructure.fragmentUsage}%</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Question ratio</span><span className="font-medium">{voiceProfile.nlpProfile.sentenceStructure.questionRatio}%</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Sentence variety</span><span className="font-medium">{voiceProfile.nlpProfile.sentenceStructure.sentenceLengthVariety}</span></div>
                    </div>
                  </div>
                )}

                {/* Vocabulary Tab */}
                {nlpTab === 'vocabulary' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Vocabulary Diversity</p>
                        <p className="text-xl font-bold text-blue-600">{Math.round(voiceProfile.nlpProfile.vocabulary.uniqueWordRatio * 100)}%</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Technical Level</p>
                        <p className="text-xl font-bold text-purple-600 capitalize">{voiceProfile.nlpProfile.vocabulary.technicalLevel}</p>
                      </div>
                    </div>
                    {voiceProfile.nlpProfile.vocabulary.powerWords.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Power Words</p>
                        <div className="flex gap-1 flex-wrap">
                          {voiceProfile.nlpProfile.vocabulary.powerWords.map(w => (
                            <Badge key={w} className="bg-green-100 text-green-700 text-xs">{w}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {voiceProfile.nlpProfile.vocabulary.fillerWords.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Filler Words (to reduce)</p>
                        <div className="flex gap-1 flex-wrap">
                          {voiceProfile.nlpProfile.vocabulary.fillerWords.map(w => (
                            <Badge key={w} className="bg-red-100 text-red-700 text-xs">{w}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {voiceProfile.nlpProfile.vocabulary.repetitionPatterns.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Repeated Words</p>
                        <div className="flex gap-1 flex-wrap">
                          {voiceProfile.nlpProfile.vocabulary.repetitionPatterns.map(w => (
                            <Badge key={w} className="bg-amber-100 text-amber-700 text-xs">{w}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {voiceProfile.nlpProfile.vocabulary.preferredTransitions.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Preferred Transitions</p>
                        <div className="flex gap-1 flex-wrap">
                          {voiceProfile.nlpProfile.vocabulary.preferredTransitions.map(w => (
                            <Badge key={w} className="bg-blue-100 text-blue-700 text-xs">{w}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Hooks Tab */}
                {nlpTab === 'hooks' && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Hook Types</p>
                      <div className="flex gap-1 flex-wrap">
                        {voiceProfile.nlpProfile.hookPatterns.primaryHookTypes.map(t => (
                          <Badge key={t} className="bg-indigo-100 text-indigo-700 text-xs capitalize">{t.replace(/_/g, ' ')}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Avg hook length</span><span className="font-medium">{voiceProfile.nlpProfile.hookPatterns.avgHookLength} words</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Hook→Body transition</span><span className="font-medium capitalize">{voiceProfile.nlpProfile.hookPatterns.hookToBodyTransition.replace(/_/g, ' ')}</span></div>
                    {voiceProfile.nlpProfile.hookPatterns.hookCharacteristics.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Characteristics</p>
                        <div className="flex gap-1 flex-wrap">
                          {voiceProfile.nlpProfile.hookPatterns.hookCharacteristics.map(c => (
                            <Badge key={c} className="bg-gray-100 text-gray-700 text-xs capitalize">{c.replace(/_/g, ' ')}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {voiceProfile.nlpProfile.hookPatterns.openingPatterns.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-2">Sample Hooks</p>
                        {voiceProfile.nlpProfile.hookPatterns.openingPatterns.map((h, i) => (
                          <div key={i} className="bg-gray-50 rounded p-2 mb-1 text-sm italic text-gray-700">&ldquo;{h}&rdquo;</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Storytelling Tab */}
                {nlpTab === 'storytelling' && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Preferred Structures</p>
                      <div className="flex gap-1 flex-wrap">
                        {voiceProfile.nlpProfile.storytelling.preferredStructures.map(s => (
                          <Badge key={s} className="bg-teal-100 text-teal-700 text-xs capitalize">{s.replace(/_/g, ' → ')}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Post Length</p>
                        <p className="font-bold capitalize">{voiceProfile.nlpProfile.storytelling.avgPostLength}</p>
                        <p className="text-xs text-gray-400">{voiceProfile.nlpProfile.storytelling.wordCountRange.avg} words avg</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Evidence Style</p>
                        <p className="font-bold capitalize">{voiceProfile.nlpProfile.storytelling.evidenceStyle.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">CTA style</span><span className="font-medium capitalize">{voiceProfile.nlpProfile.storytelling.ctaStyle}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">CTA frequency</span><span className="font-medium">{Math.round(voiceProfile.nlpProfile.storytelling.ctaFrequency * 100)}% of posts</span></div>
                  </div>
                )}

                {/* Formatting Tab */}
                {nlpTab === 'formatting' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Emoji Usage</p>
                        <p className="font-bold capitalize">{voiceProfile.nlpProfile.formatting.emojiFrequency > 0.3 ? 'Frequent' : voiceProfile.nlpProfile.formatting.emojiFrequency > 0.1 ? 'Moderate' : 'Minimal'}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Hashtag Style</p>
                        <p className="font-bold capitalize">{voiceProfile.nlpProfile.formatting.hashtagStyle}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Formatting Style</p>
                        <p className="font-bold capitalize">{voiceProfile.nlpProfile.paragraphStructure.formattingStyle}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Number Style</p>
                        <p className="font-bold capitalize">{voiceProfile.nlpProfile.formatting.numberStyle}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Period usage</span><span className="font-medium capitalize">{voiceProfile.nlpProfile.punctuation.periodStyle}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Exclamation</span><span className="font-medium capitalize">{voiceProfile.nlpProfile.punctuation.exclamationStyle}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Comma style</span><span className="font-medium capitalize">{voiceProfile.nlpProfile.punctuation.commaStyle}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Dash usage</span><span className="font-medium">{voiceProfile.nlpProfile.punctuation.dashUsage > 0.3 ? 'Frequent' : 'Minimal'}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Single-sentence paragraphs</span><span className="font-medium">{voiceProfile.nlpProfile.paragraphStructure.singleSentenceParagraphs}%</span></div>
                    </div>
                  </div>
                )}

                {/* Emotions Tab */}
                {nlpTab === 'emotions' && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Primary Emotions</p>
                      <div className="flex gap-1 flex-wrap">
                        {voiceProfile.nlpProfile.emotionalFingerprint.primaryEmotions.map(e => (
                          <Badge key={e} className="bg-rose-100 text-rose-700 text-xs capitalize">{e}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Emotional Intensity</p>
                        <p className="font-bold capitalize">{voiceProfile.nlpProfile.emotionalFingerprint.emotionalIntensity}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Connection Style</p>
                        <p className="font-bold capitalize">{voiceProfile.nlpProfile.emotionalFingerprint.connectionStyle}</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">Vulnerability Level</span>
                        <span className="text-xs font-medium">{Math.round(voiceProfile.nlpProfile.emotionalFingerprint.vulnerabilityLevel * 100)}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-rose-300 to-rose-500 rounded-full"
                          style={{ width: `${Math.round(voiceProfile.nlpProfile.emotionalFingerprint.vulnerabilityLevel * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Inspiration Style</p>
                      <Badge className="bg-amber-100 text-amber-700 text-xs capitalize">{voiceProfile.nlpProfile.emotionalFingerprint.inspirationStyle}</Badge>
                    </div>
                    {voiceProfile.nlpProfile.consistency.improvementAreas.length > 0 && (
                      <div className="mt-4 p-3 bg-amber-50 rounded-lg">
                        <p className="text-xs font-medium text-amber-800 mb-1">💡 Suggestions</p>
                        {voiceProfile.nlpProfile.consistency.improvementAreas.map((area, i) => (
                          <p key={i} className="text-xs text-amber-700">• {area}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Voice DNA Confirmation Prompt */}
            {!voiceProfile.userConfirmed && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium mb-3">
                  Does this sound like you?
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={rating === "yes" ? "default" : "outline"}
                    onClick={() => rateVoice("yes")}
                  >
                    👍 Yes
                  </Button>
                  <Button
                    size="sm"
                    variant={rating === "somewhat" ? "default" : "outline"}
                    onClick={() => rateVoice("somewhat")}
                  >
                    👋 Somewhat
                  </Button>
                  <Button
                    size="sm"
                    variant={rating === "no" ? "destructive" : "outline"}
                    onClick={() => rateVoice("no")}
                  >
                    👎 No
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-6">
              <Button
                onClick={runAnalysis}
                disabled={analyzing || samples.length < 3}
                variant="outline"
              >
                {analyzing ? "Analyzing..." : "Reanalyze"}
              </Button>
              <Button
                onClick={() => importLinkedInPosts()}
                disabled={importingLinkedIn}
                variant="outline"
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
              >
                {importingLinkedIn ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Fetching from LinkedIn...
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    Fetch LinkedIn Posts
                  </span>
                )}
              </Button>
              {!hasLinkedIn && (
                <a
                  href="/settings/linkedin"
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 underline underline-offset-2"
                >
                  Connect LinkedIn to pull your feed posts →
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardContent className="p-8 text-center">
            <p className="text-gray-500 mb-4">
              No Voice DNA yet. Add at least 3 writing samples to get started.
            </p>
            <p className="text-sm text-gray-400 mb-5">
              You have {samples.length} sample{samples.length !== 1 ? "s" : ""}.
              {samples.length < 3 && ` ${3 - samples.length} more needed.`}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={() => importLinkedInPosts()}
                disabled={importingLinkedIn}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
              >
                {importingLinkedIn ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Importing...
                  </span>
                ) : (
                  <span className="flex items-center gap-1">Import my published posts</span>
                )}
              </Button>
              {!hasLinkedIn && (
                <a
                  href="/settings/linkedin"
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 underline underline-offset-2"
                >
                  Connect LinkedIn to also pull your feed posts →
                </a>
              )}
              <span className="text-xs text-gray-400">
                Pulls posts you already published through this app — no manual pasting.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Writing Samples */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Writing Samples ({samples.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Add Sample Form */}
          <div className="mb-6 space-y-3">
            <div className="flex gap-2">
              <select
                value={newSampleSource}
                onChange={(e) => setNewSampleSource(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <Textarea
              value={newSample}
              onChange={(e) => setNewSample(e.target.value)}
              placeholder="Paste a writing sample (LinkedIn post, blog, email, etc.)"
              rows={4}
            />
            <Button
              onClick={addSample}
              disabled={newSample.length < 10}
              size="sm"
            >
              Add Sample
            </Button>
          </div>

          {/* Sample List */}
          <div className="space-y-3">
            {samples.map((sample) => (
              <div
                key={sample.id}
                className="border rounded-lg p-4 relative group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs">
                        {SOURCE_OPTIONS.find(
                          (o) => o.value === sample.source
                        )?.label || sample.source}
                      </Badge>
                      <span className="text-xs text-gray-400">
                        Weight: {sample.weight.toFixed(1)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-3">
                      {sample.content}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteSample(sample.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 text-sm transition-opacity"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
