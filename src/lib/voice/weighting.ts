/**
 * Source Weighting
 *
 * Different source types have different representativeness for "LinkedIn voice."
 * LinkedIn-native samples weighted highest by default.
 */

export const DEFAULT_SOURCE_WEIGHTS: Record<string, number> = {
  linkedin_post: 1.0,
  blog: 0.6,
  email: 0.5,
  slack: 0.4,
  other: 0.4,
};

/**
 * Get weight for a given source type.
 */
export function getSourceWeight(
  sourceType: string,
  customWeights?: Record<string, number>
): number {
  const weights = customWeights || DEFAULT_SOURCE_WEIGHTS;
  return weights[sourceType] ?? DEFAULT_SOURCE_WEIGHTS.other;
}

/**
 * Compute aggregate weight for a set of samples.
 * Used to adjust Voice DNA confidence based on sample quality.
 */
export function computeAggregateWeight(
  samples: Array<{ sourceType: string | null }>
): number {
  if (samples.length === 0) return 0;

  const weights = samples.map((s) =>
    getSourceWeight(s.sourceType || "other")
  );

  // Weighted average — LinkedIn posts count more
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  return totalWeight / weights.length;
}

/**
 * Get human-readable label for source type.
 */
export function sourceLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    linkedin_post: "LinkedIn Post",
    blog: "Blog Post",
    email: "Email",
    slack: "Slack Message",
    other: "Other Writing",
  };
  return labels[sourceType] || sourceType;
}

/**
 * Get badge color class for source type.
 */
export function sourceBadgeColor(sourceType: string): string {
  const colors: Record<string, string> = {
    linkedin_post: "bg-blue-100 text-blue-800",
    blog: "bg-green-100 text-green-800",
    email: "bg-yellow-100 text-yellow-800",
    slack: "bg-purple-100 text-purple-800",
    other: "bg-gray-100 text-gray-800",
  };
  return colors[sourceType] || colors.other;
}
