"use client";

/**
 * Post-auth routing: after login/signup succeeds, decide where the user goes.
 *
 * New users who never completed the 5-step onboarding questionnaire are sent
 * to /onboarding so we can ask the DNA questions. Everyone else (completed
 * onboarding, or an active user with Voice DNA/content) goes to /dashboard.
 * A user who tapped "Skip for now" during the session is respected.
 */
export async function resolvePostAuthRoute(): Promise<string> {
  try {
    if (typeof window !== "undefined") {
      try {
        if (sessionStorage.getItem("onboarding_skipped") === "1") {
          return "/dashboard";
        }
      } catch {
        /* private mode */
      }
    }

    const res = await fetch("/api/account/onboarding", {
      cache: "no-store",
    });
    const data = await res.json();
    if (res.ok && data.success && data.completed === false) {
      return "/onboarding";
    }
    return "/dashboard";
  } catch {
    // If the status check fails, never block the user — go to the dashboard.
    return "/dashboard";
  }
}
