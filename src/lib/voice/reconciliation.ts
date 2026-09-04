/**
 * Voice Reconciliation
 *
 * Compares user's self-reported slider positions with AI-detected voice.
 * If delta exceeds threshold, surfaces a reconciliation prompt.
 *
 * PRD §8.2: "sliders are defaults, not commitments — they should be visibly
 * overridden by the actual Voice DNA analysis once samples are provided"
 */

import type { VoiceSliders } from "@/types";

interface ReconciliationDelta {
  dimension: string;
  selfReported: string;
  aiDetected: string;
  delta: number;
  shouldPrompt: boolean;
}

const DELTA_THRESHOLD = 30; // Slider positions differ by >30 points

/**
 * Convert slider position (0–100) to a label.
 */
function sliderLabel(value: number, lowLabel: string, highLabel: string): string {
  if (value < 35) return lowLabel;
  if (value > 65) return highLabel;
  return "Balanced";
}

/**
 * Convert AI-detected tone/style to a comparable slider position.
 */
function aiToSlider(
  aiValues: string[],
  lowKeyword: string,
  highKeyword: string
): number {
  const hasLow = aiValues.some((v) =>
    v.toLowerCase().includes(lowKeyword.toLowerCase())
  );
  const hasHigh = aiValues.some((v) =>
    v.toLowerCase().includes(highKeyword.toLowerCase())
  );

  if (hasLow && !hasHigh) return 20;
  if (hasHigh && !hasLow) return 80;
  if (hasLow && hasHigh) return 50;
  return 50; // Neutral if neither detected
}

/**
 * Compare self-reported sliders with AI-detected voice.
 * Returns dimensions that have meaningful deltas.
 */
export function reconcileVoices(
  selfReported: VoiceSliders,
  aiTone: string[],
  aiSentenceStyle: string | null,
  aiHookPatterns: string[]
): ReconciliationDelta[] {
  const deltas: ReconciliationDelta[] = [];

  // Professional ↔ Casual
  const casualAI = aiToSlider(aiTone, "professional", "casual");
  const casualDelta = Math.abs(selfReported.professionalCasual - casualAI);
  deltas.push({
    dimension: "Professional ↔ Casual",
    selfReported: sliderLabel(selfReported.professionalCasual, "Professional", "Casual"),
    aiDetected: sliderLabel(casualAI, "Professional", "Casual"),
    delta: casualDelta,
    shouldPrompt: casualDelta > DELTA_THRESHOLD,
  });

  // Educational ↔ Personal
  const personalAI = aiToSlider(aiTone, "educational", "personal");
  const personalDelta = Math.abs(selfReported.educationalPersonal - personalAI);
  deltas.push({
    dimension: "Educational ↔ Personal",
    selfReported: sliderLabel(selfReported.educationalPersonal, "Educational", "Personal"),
    aiDetected: sliderLabel(personalAI, "Educational", "Personal"),
    delta: personalDelta,
    shouldPrompt: personalDelta > DELTA_THRESHOLD,
  });

  // Safe ↔ Contrarian
  const contrarianAI = aiToSlider(
    [...aiTone, ...aiHookPatterns],
    "safe",
    "contrarian"
  );
  const contrarianDelta = Math.abs(selfReported.safeContrarian - contrarianAI);
  deltas.push({
    dimension: "Safe ↔ Contrarian",
    selfReported: sliderLabel(selfReported.safeContrarian, "Safe", "Contrarian"),
    aiDetected: sliderLabel(contrarianAI, "Safe", "Contrarian"),
    delta: contrarianDelta,
    shouldPrompt: contrarianDelta > DELTA_THRESHOLD,
  });

  // Simple ↔ Detailed
  const detailedAI = aiToSlider(
    [aiSentenceStyle || ""],
    "short",
    "long"
  );
  const detailedDelta = Math.abs(selfReported.simpleDetailed - detailedAI);
  deltas.push({
    dimension: "Simple ↔ Detailed",
    selfReported: sliderLabel(selfReported.simpleDetailed, "Simple", "Detailed"),
    aiDetected: sliderLabel(detailedAI, "Simple", "Detailed"),
    delta: detailedDelta,
    shouldPrompt: detailedDelta > DELTA_THRESHOLD,
  });

  return deltas;
}

/**
 * Get dimensions that need reconciliation (user should see a prompt).
 */
export function getDeltasNeedingReconciliation(
  selfReported: VoiceSliders,
  aiTone: string[],
  aiSentenceStyle: string | null,
  aiHookPatterns: string[]
): ReconciliationDelta[] {
  return reconcileVoices(
    selfReported,
    aiTone,
    aiSentenceStyle,
    aiHookPatterns
  ).filter((d) => d.shouldPrompt);
}
