/**
 * Analytics Event Tracking
 *
 * PRD §5.2: Instrument activation → retention funnel.
 * Minimal, privacy-respecting event tracking.
 * Replace with PostHog, Mixpanel, or similar in production.
 */

type AnalyticsEvent =
  | { event: "signup"; method: "email" | "google" }
  | { event: "onboarding_step"; step: number }
  | { event: "onboarding_complete" }
  | { event: "writing_sample_added"; source: string; totalSamples: number }
  | { event: "voice_dna_generated"; confidenceScore: number; sampleCount: number }
  | { event: "voice_dna_rated"; rating: "yes" | "somewhat" | "no" }
  | { event: "voice_dna_confirmed" }
  | { event: "post_generated"; voiceDnaVersionUsed: number; confidenceScore: number }
  | { event: "post_edited"; generationId: string }
  | { event: "post_saved_draft" }
  | { event: "post_published"; method: "manual" | "api" | "auto_queue" | "full_auto" }
  | { event: "hook_generated"; hookCount: number }
  | { event: "ideas_generated"; ideaCount: number }
  | { event: "idea_dismissed" }
  | { event: "generation_rejected"; reason: string }
  | { event: "linkedin_connected" }
  | { event: "linkedin_disconnected" }
  | { event: "publish_mode_changed"; mode: string }
  | { event: "data_exported" }
  | { event: "rewrite_used" }
  | { event: "profile_review_started"; source: "url" | "content" }
  | { event: "profile_review_completed"; usedAi: boolean; overallScore: number }
  | { event: "profile_review_failed"; reason: string }
  | { event: "recommendation_copied"; category: string }
  | { event: "headline_generated" }
  | { event: "about_generated" }
  | { event: "profile_connected" }
  | { event: "voice_dna_created"; source: "profile_review" }
  | { event: "signup_after_review" }
  | { event: "upgrade_after_review" };

/**
 * Track an analytics event.
 * In development, logs to console.
 * In production, send to analytics service.
 */
export function trackEvent(event: AnalyticsEvent) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[Analytics] ${event.event}`, event);
    return;
  }

  // Production: send to analytics service
  // Example with PostHog:
  // posthog.track(event.event, event);

  // Example with fetch:
  // fetch("/api/analytics", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(event),
  // });
}

/**
 * Get funnel metrics for the activation → retention chain (§5.2).
 */
export function getFunnelMetrics() {
  // Returns:
  // - Onboarding completion rate
  // - Voice DNA creation rate
  // - Voice DNA "sounds like me" rate
  // - First post generation rate
  // - Edit vs blind-accept ratio
  // - Day-7 return rate
  // - Day-30 return rate
  return {
    onboardingComplete: false,
    voiceDnaCreated: false,
    voiceDnaConfirmed: false,
    firstPostGenerated: false,
    editRatio: 0,
    day7Return: false,
    day30Return: false,
  };
}
