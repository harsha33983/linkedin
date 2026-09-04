/**
 * Voice DNA Confidence Scoring
 *
 * Computes a 0.0–1.0 confidence score from:
 * - Sample count factor (0.6 weight): min(sampleCount / 10, 1.0)
 * - Consistency factor (0.4 weight): agreement across samples
 *
 * Maps to display tier: Emerging / Solid / Strong
 */

export type ConfidenceTier = "Emerging" | "Solid" | "Strong";

/**
 * Compute confidence score from sample count and AI consistency score.
 * @param sampleCount - number of writing samples provided
 * @param consistencyScore - 0.0–1.0 from AI analysis (agreement across samples)
 * @returns confidence score 0.0–1.0
 */
export function computeConfidenceScore(
  sampleCount: number,
  consistencyScore: number
): number {
  const sampleFactor = Math.min(sampleCount / 10, 1.0) * 0.6;
  const consistencyFactor = Math.max(0, Math.min(1, consistencyScore)) * 0.4;
  return Math.round((sampleFactor + consistencyFactor) * 100) / 100;
}

/**
 * Map confidence score to a user-facing tier.
 * Surfaced as "Voice DNA strength: Emerging / Solid / Strong"
 */
export function confidenceTier(score: number): ConfidenceTier {
  if (score < 0.4) return "Emerging";
  if (score < 0.7) return "Solid";
  return "Strong";
}

/**
 * Get human-readable description of confidence tier.
 */
export function confidenceDescription(tier: ConfidenceTier): string {
  switch (tier) {
    case "Emerging":
      return "Your voice is still being learned. Add more samples for better results.";
    case "Solid":
      return "Good voice recognition. Results should feel like you most of the time.";
    case "Strong":
      return "Strong voice recognition. AI output closely matches your writing style.";
  }
}

/**
 * Should downstream features visibly flag output as lower-confidence?
 */
export function isLowConfidence(score: number): boolean {
  return score < 0.4;
}
