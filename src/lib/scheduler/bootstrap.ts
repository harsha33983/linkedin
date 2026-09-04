/**
 * Scheduler Bootstrap
 *
 * Ensures the scheduler is started exactly once when the app loads.
 * Used as a fallback if instrumentation.ts doesn't fire in dev mode.
 * Import this from any server-side module that loads early (e.g. db.ts or middleware).
 */

import { startScheduler } from "@/lib/scheduler/publisher";

let initialized = false;

export function ensureSchedulerStarted(): void {
  if (!initialized && process.env.NEXT_RUNTIME !== "edge") {
    initialized = true;
    // Defer to next tick so we don't block the import
    setTimeout(() => {
      try {
        startScheduler();
      } catch (err) {
        console.error("[SchedulerBootstrap] Failed to start scheduler:", err);
      }
    }, 2000);
  }
}
