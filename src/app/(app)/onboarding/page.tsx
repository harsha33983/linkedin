"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const IDENTITY_OPTIONS = ["Founder", "Creator", "Freelancer", "Consultant", "Employee", "Job Seeker", "Other"];

const EXPERTISE_OPTIONS = ["AI", "Startups", "Technology", "Marketing", "Sales", "Education", "Leadership", "Finance"];

const AUDIENCE_OPTIONS = ["Founders", "Developers", "Recruiters", "Students", "Business Owners", "Marketers"];

const GOAL_OPTIONS = ["Grow audience", "Build authority", "Generate leads", "Find opportunities", "Build personal brand", "Promote a business"];

interface OnboardingSnapshot {
  step: number;
  data: any;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Step 1: Identity
  const [identity, setIdentity] = useState("");
  // Step 2: Expertise
  const [expertise, setExpertise] = useState<string[]>([]);
  const [customExpertise, setCustomExpertise] = useState("");
  // Step 3: Audience
  const [audience, setAudience] = useState<string[]>([]);
  const [customAudience, setCustomAudience] = useState("");
  // Step 4: Goals
  const [goals, setGoals] = useState<string[]>([]);
  // Step 5: Voice Sliders
  const [professionalCasual, setProfessionalCasual] = useState(50);
  const [educationalPersonal, setEducationalPersonal] = useState(50);
  const [safeContrarian, setSafeContrarian] = useState(50);
  const [simpleDetailed, setSimpleDetailed] = useState(50);

  // Resume a half-finished questionnaire: restore saved answers and jump to
  // the furthest step the user completed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/onboarding");
        const data = await res.json();
        if (!data?.success || cancelled) return;

        const snapshots: OnboardingSnapshot[] = data.data || [];
        const byStep = new Map<number, any>();
        for (const s of snapshots) byStep.set(s.step, s.data);

        if (byStep.has(1) && byStep.get(1)?.occupation) setIdentity(byStep.get(1).occupation);
        if (byStep.has(2) && Array.isArray(byStep.get(2)?.expertise)) setExpertise(byStep.get(2).expertise);
        if (byStep.has(3) && Array.isArray(byStep.get(3)?.targetAudience)) setAudience(byStep.get(3).targetAudience);
        if (byStep.has(4) && Array.isArray(byStep.get(4)?.linkedinGoals)) setGoals(byStep.get(4).linkedinGoals);
        if (byStep.has(5) && byStep.get(5)?.voiceSliders) {
          const v = byStep.get(5).voiceSliders;
          if (typeof v.professionalCasual === "number") setProfessionalCasual(v.professionalCasual);
          if (typeof v.educationalPersonal === "number") setEducationalPersonal(v.educationalPersonal);
          if (typeof v.safeContrarian === "number") setSafeContrarian(v.safeContrarian);
          if (typeof v.simpleDetailed === "number") setSimpleDetailed(v.simpleDetailed);
        }

        const highest = Math.max(0, ...snapshots.map((s) => s.step));
        if (highest >= 1 && highest < 5) setStep(highest + 1);
      } catch {
        /* resume is best-effort */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleMulti = (arr: string[], setArr: (v: string[]) => void, value: string) => {
    setArr(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  };

  const saveStep = async (stepNum: number, data: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await fetch("/api/account/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: stepNum, data }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setError(body?.error || body?.message || `Failed to save step ${stepNum}. Please try again.`);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Failed to save step:", err);
      setError("Network error — please check your connection and try again.");
      return false;
    }
  };

  const handleNext = async () => {
    setLoading(true);
    setMessage("");
    setError("");

    switch (step) {
      case 1:
        if (!(await saveStep(1, { occupation: identity }))) break;
        setStep(2);
        break;
      case 2:
        if (!(await saveStep(2, { expertise }))) break;
        setStep(3);
        break;
      case 3:
        if (!(await saveStep(3, { targetAudience: audience }))) break;
        setStep(4);
        break;
      case 4:
        if (!(await saveStep(4, { linkedinGoals: goals }))) break;
        setStep(5);
        break;
      case 5: {
        const ok = await saveStep(5, {
          voiceSliders: { professionalCasual, educationalPersonal, safeContrarian, simpleDetailed },
        });
        setLoading(false);
        if (!ok) return; // stay on step 5 with the error visible
        setMessage("Onboarding complete! Continue to your Voice DNA.");
        router.push("/voice-dna");
        return;
      }
    }

    setLoading(false);
  };

  const skipOnboarding = () => {
    try {
      sessionStorage.setItem("onboarding_skipped", "1");
    } catch {
      /* private mode */
    }
    router.push("/dashboard");
  };

  const canProceed = () => {
    switch (step) {
      // Per PRD §8.2 only Identity is required; steps 2-5 are skippable.
      case 1: return identity !== "";
      default: return true;
    }
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-400">Loading your questionnaire...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Let&apos;s set up your profile</h1>
            <p className="text-gray-600 mt-1">
              A few questions so we can build your Voice DNA — the foundation every generated post is written in.
            </p>
          </div>
          <button
            onClick={skipOnboarding}
            className="text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2 whitespace-nowrap mt-1"
          >
            Skip for now
          </button>
        </div>

        <Card>
          <CardContent className="p-8">
            {/* Progress bar */}
            <div className="flex gap-2 mb-8">
              {[1, 2, 3, 4, 5].map((s) => (
                <div
                  key={s}
                  className={`flex-1 h-1.5 rounded-full transition-colors ${
                    s <= step ? "bg-gray-900" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>

            {/* Step 1: Identity */}
            {step === 1 && (
              <div>
                <h2 className="text-lg font-semibold mb-1">
                  Step 1 of 5: What best describes you?
                </h2>
                <p className="text-sm text-gray-500 mb-4">Required — helps us default tone and copy.</p>
                <div className="grid grid-cols-2 gap-3">
                  {IDENTITY_OPTIONS.map((role) => (
                    <button
                      key={role}
                      onClick={() => setIdentity(role)}
                      className={`border rounded-md px-4 py-3 text-sm text-left transition-colors ${
                        identity === role
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-300 hover:border-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Expertise */}
            {step === 2 && (
              <div>
                <h2 className="text-lg font-semibold mb-1">
                  Step 2 of 5: What&apos;s your area of expertise?
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  Select all that apply — you can add custom topics too. (Optional)
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {EXPERTISE_OPTIONS.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => toggleMulti(expertise, setExpertise, topic)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        expertise.includes(topic)
                          ? "bg-gray-900 text-white border-gray-900"
                          : "border-gray-300 hover:border-gray-900"
                      }`}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <Input
                    value={customExpertise}
                    onChange={(e) => setCustomExpertise(e.target.value)}
                    placeholder="Add custom topic..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customExpertise.trim()) {
                        toggleMulti(expertise, setExpertise, customExpertise.trim());
                        setCustomExpertise("");
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (customExpertise.trim()) {
                        toggleMulti(expertise, setExpertise, customExpertise.trim());
                        setCustomExpertise("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Audience */}
            {step === 3 && (
              <div>
                <h2 className="text-lg font-semibold mb-1">
                  Step 3 of 5: Who&apos;s your target audience?
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  Who do you want to reach on LinkedIn? (Optional)
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {AUDIENCE_OPTIONS.map((a) => (
                    <button
                      key={a}
                      onClick={() => toggleMulti(audience, setAudience, a)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        audience.includes(a)
                          ? "bg-gray-900 text-white border-gray-900"
                          : "border-gray-300 hover:border-gray-900"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <Input
                    value={customAudience}
                    onChange={(e) => setCustomAudience(e.target.value)}
                    placeholder="Add custom audience..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customAudience.trim()) {
                        toggleMulti(audience, setAudience, customAudience.trim());
                        setCustomAudience("");
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (customAudience.trim()) {
                        toggleMulti(audience, setAudience, customAudience.trim());
                        setCustomAudience("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Goals */}
            {step === 4 && (
              <div>
                <h2 className="text-lg font-semibold mb-1">
                  Step 4 of 5: What are your LinkedIn goals?
                </h2>
                <p className="text-sm text-gray-500 mb-4">Select all that apply. (Optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  {GOAL_OPTIONS.map((g) => (
                    <button
                      key={g}
                      onClick={() => toggleMulti(goals, setGoals, g)}
                      className={`border rounded-md px-4 py-3 text-sm text-left transition-colors ${
                        goals.includes(g)
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-300 hover:border-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 5: Voice Sliders */}
            {step === 5 && (
              <div>
                <h2 className="text-lg font-semibold mb-1">
                  Step 5 of 5: How would you describe your voice?
                </h2>
                <p className="text-sm text-gray-500 mb-6">
                  These answers create your starting Voice DNA. We&apos;ll refine it based on your actual writing once you add samples.
                </p>

                <div className="space-y-8">
                  <SliderControl
                    label="Professional ↔ Casual"
                    value={professionalCasual}
                    onChange={setProfessionalCasual}
                    leftLabel="Professional"
                    rightLabel="Casual"
                  />
                  <SliderControl
                    label="Educational ↔ Personal"
                    value={educationalPersonal}
                    onChange={setEducationalPersonal}
                    leftLabel="Educational"
                    rightLabel="Personal"
                  />
                  <SliderControl
                    label="Safe ↔ Contrarian"
                    value={safeContrarian}
                    onChange={setSafeContrarian}
                    leftLabel="Safe"
                    rightLabel="Contrarian"
                  />
                  <SliderControl
                    label="Simple ↔ Detailed"
                    value={simpleDetailed}
                    onChange={setSimpleDetailed}
                    leftLabel="Simple"
                    rightLabel="Detailed"
                  />
                </div>
              </div>
            )}

            {message && (
              <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded mt-4">
                {message}
              </div>
            )}
            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded mt-4">
                {error}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-8">
              {step > 1 ? (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              ) : (
                <div />
              )}
              <Button onClick={handleNext} disabled={!canProceed() || loading}>
                {loading ? "Saving..." : step === 5 ? "Create My Voice DNA →" : "Continue"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SliderControl({
  label,
  value,
  onChange,
  leftLabel,
  rightLabel,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs text-gray-500">
          {value < 35 ? leftLabel : value > 65 ? rightLabel : "Balanced"}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-400">{leftLabel}</span>
        <span className="text-xs text-gray-400">{rightLabel}</span>
      </div>
    </div>
  );
}
