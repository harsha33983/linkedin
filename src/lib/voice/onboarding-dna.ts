/**
 * Onboarding → Voice DNA seeding
 *
 * When a user completes the 5-step onboarding questionnaire, their answers are
 * the first signal of how they want to sound. This service turns those answers
 * into an initial voice_profiles row ("seeded DNA") so the Voice DNA exists
 * immediately after signup. The NLP/AI analysis later refines (never replaces
 * the concept of) this DNA once 3+ real writing samples exist.
 *
 * Rules:
 *  - Only seeds when the user has NO voice profile yet (never downgrades a
 *    profile that was built from real samples/AI analysis).
 *  - The sliders map to conservative tone defaults; everything is recorded in
 *    metadata so the analysis pipeline can reconcile self-report vs. evidence.
 */

import { sql } from "@/lib/db";

export interface OnboardingVoiceAnswers {
  voiceSliders?: {
    professionalCasual?: number;
    educationalPersonal?: number;
    safeContrarian?: number;
    simpleDetailed?: number;
  };
}

function pick(values: (string | null)[]): string[] {
  const out = values.filter((v): v is string => !!v);
  return out.length > 0 ? Array.from(new Set(out)) : ["professional", "authentic"];
}

/**
 * Derive a voice tone list from the 4 onboarding sliders.
 * Slider semantics (0 ↔ 100): the left label is 0, the right label is 100.
 */
export function toneFromSliders(s: OnboardingVoiceAnswers["voiceSliders"] = {}): string[] {
  const p = s.professionalCasual; // Professional(0) ↔ Casual(100)
  const e = s.educationalPersonal; // Educational(0) ↔ Personal(100)
  const c = s.safeContrarian; // Safe(0) ↔ Contrarian(100)
  const d = s.simpleDetailed; // Simple(0) ↔ Detailed(100)

  return pick([
    typeof p === "number" ? (p > 65 ? "conversational" : p < 35 ? "professional" : null) : null,
    typeof e === "number" ? (e > 65 ? "personal" : e < 35 ? "educational" : null) : null,
    typeof c === "number" ? (c > 65 ? "opinionated" : c < 35 ? "supportive" : null) : null,
    typeof d === "number" ? (d > 65 ? "detailed" : d < 35 ? "concise" : null) : null,
    typeof c === "number" && c > 65 ? "confident" : typeof p === "number" && p > 65 ? "approachable" : null,
  ]);
}

/** Map sliders + profile onto a starter archetype the UI can show. */
export function archetypeFromAnswers(
  answers: OnboardingVoiceAnswers,
  occupation?: string | null
): string {
  const s = answers.voiceSliders || {};
  const c = s.safeContrarian ?? 50;
  const p = s.professionalCasual ?? 50;
  const e = s.educationalPersonal ?? 50;
  const occ = (occupation || "").toLowerCase();

  if (occ.includes("founder") || occ.includes("entrepreneur")) {
    return c > 65 ? "the contrarian builder" : "the practitioner";
  }
  if (occ.includes("creator")) return "the storyteller";
  if (occ.includes("consultant")) return "the analyst";
  if (occ.includes("employee")) {
    return e < 35 ? "the analyst" : c > 65 ? "the direct communicator" : "the practitioner";
  }
  if (occ.includes("job seeker")) return "the mentor";
  if (p > 65 && e > 65) return "the friend";
  if (c > 65) return "the rebel";
  if (e < 35) return "the analyst";
  return "the practitioner";
}

/**
 * Seed an initial Voice DNA profile from onboarding answers.
 * Returns { created: true } when a row was inserted, or { created: false,
 * reason: "existing" } when the user already has a voice profile.
 */
export async function seedVoiceDnaFromOnboarding(
  userId: string,
  answers: OnboardingVoiceAnswers
): Promise<{ created: boolean; reason?: string }> {
  const [existing] = await sql`
    SELECT id FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1
  `;
  if (existing) {
    return { created: false, reason: "existing" };
  }

  // Pull the rest of the onboarding profile for context (steps 1-4).
  const [profile] = await sql`
    SELECT occupation, expertise, "targetAudience", "linkedinGoals", preferences
    FROM user_profiles WHERE "userId" = ${userId} LIMIT 1
  `;

  const sliders = answers.voiceSliders || {};
  const tone = toneFromSliders(sliders);
  const archetype = archetypeFromAnswers(answers, profile?.occupation);

  const simpleDetailed = sliders.simpleDetailed ?? 50;
  const sentenceStyle = simpleDetailed > 65 ? "medium-long" : simpleDetailed < 35 ? "short-medium" : "medium";
  const paragraphStyle = (sliders.educationalPersonal ?? 50) > 65 ? "short" : "medium";
  const emojiUsage = (sliders.professionalCasual ?? 50) > 65 && (sliders.educationalPersonal ?? 50) > 65 ? "moderate" : "low";
  const ctaStyle = Array.isArray(profile?.linkedinGoals) && profile.linkedinGoals.includes("Generate leads")
    ? "soft ask"
    : Array.isArray(profile?.linkedinGoals) && profile.linkedinGoals.includes("Grow audience")
    ? "engagement ask"
    : "none";

  const commonTopics = Array.isArray(profile?.expertise) ? profile.expertise.slice(0, 8) : [];
  const wordsToAvoid: string[] = [];

  const hookPatterns: string[] = [];
  if (archetype === "the storyteller" || archetype === "the friend") hookPatterns.push("personal story");
  if ((sliders.safeContrarian ?? 50) > 65) hookPatterns.push("opinion");
  if (hookPatterns.length === 0) hookPatterns.push("question");

  const writingPatterns = {
    voiceArchetype: archetype,
    seededFromOnboarding: true,
    asksQuestions: hookPatterns.includes("question"),
    personalStories: hookPatterns.includes("personal story"),
    avgSentenceLength: sentenceStyle,
  };

  await sql`
    INSERT INTO voice_profiles (
      id, "userId", tone, "sentenceStyle", "paragraphStyle", "hookPatterns",
      "ctaStyle", "emojiUsage", "commonTopics", "wordsToAvoid", "writingPatterns",
      "confidenceScore", "sampleCount", version, "sourceWeighting", metadata, "lastUpdated"
    ) VALUES (
      gen_random_uuid(), ${userId}, ${JSON.stringify(tone)}::jsonb,
      ${sentenceStyle}, ${paragraphStyle},
      ${JSON.stringify(hookPatterns)}::jsonb, ${ctaStyle},
      ${emojiUsage}, ${JSON.stringify(commonTopics)}::jsonb,
      ${wordsToAvoid}, ${JSON.stringify(writingPatterns)}::jsonb,
      0.15, 0, 1,
      ${JSON.stringify({})}::jsonb,
      ${JSON.stringify({
        source: "onboarding",
        seededFromOnboarding: true,
        answers,
        occupation: profile?.occupation || null,
        expertise: commonTopics,
        archetype,
        note: "Default DNA from onboarding answers. Refine with 3+ writing samples.",
      })}::jsonb,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("userId") DO NOTHING
  `;

  return { created: true };
}
