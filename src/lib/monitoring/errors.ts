/**
 * Error Monitoring
 *
 * PRD §18: Error tracking in production.
 * This is a stub — integrate with Sentry, LogRocket, or similar.
 */

export function initErrorMonitoring() {
  if (process.env.NODE_ENV !== "production") return;

  // Production: initialize Sentry or similar
  // import * as Sentry from "@sentry/nextjs";
  // Sentry.init({
  //   dsn: process.env.SENTRY_DSN,
  //   tracesSampleRate: 0.1,
  // });
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  console.error("[ErrorMonitor]", error.message, context);

  if (process.env.NODE_ENV === "production") {
    // Sentry.captureException(error, { extra: context });
  }
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info") {
  console.log(`[ErrorMonitor:${level}]`, message);

  if (process.env.NODE_ENV === "production") {
    // Sentry.captureMessage(message, level);
  }
}
