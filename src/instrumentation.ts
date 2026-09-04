/**
 * Next.js Instrumentation Hook
 *
 * Runs once when the server starts. Used to initialize the cron scheduler.
 * Requires experimental.instrumentation = true in next.config.js (or enabled by default in Next 15+).
 */

export async function register() {
  // Only run on the server, and only in production or development (not during build)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler/publisher");
    startScheduler();
  }
}
