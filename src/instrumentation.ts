/**
 * Next.js Instrumentation Hook
 *
 * Runs once when the server starts. Initializes the cron scheduler and
 * warms the viral-posts central cache so the first visitor gets an
 * instant load instead of waiting for a scrape.
 */

export async function register() {
  // Only run on the server, and only in production or development (not during build)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler/publisher");
    startScheduler();

    // Warm the trending-posts cache in the background. Never blocks boot
    // and never crashes the server if the scraper service is down.
    // Staggers every UI chip keyword so a user click usually hits cache
    // instead of a cold ~90s scrape.
    if (process.env.VIRAL_POSTS_WARMUP !== "off") {
      const keywords = [
        process.env.VIRAL_POSTS_DEFAULT_KEYWORD || "AI",
        "SaaS",
        "Marketing",
        "Startups",
        "Career",
        "Leadership",
        "Productivity",
      ].filter((kw, i, a) => a.indexOf(kw) === i);
      const days = 14;
      let idx = 0;
      const warmNext = async () => {
        if (idx >= keywords.length) return;
        const keyword = keywords[idx++];
        try {
          const { getCacheState, upsertPosts } = await import("@/lib/viral-posts/store");
          const { scrapeSearch } = await import("@/lib/viral-posts/scraper-client");
          const state = await getCacheState(keyword, days);
          if (!state.fresh) {
            const result = await scrapeSearch({ keyword, days, limit: 30 });
            if (result.posts.length > 0) {
              await upsertPosts(result.posts, keyword, days);
            }
            console.log(`[ViralPosts] warmup ${keyword}: ${result.extracted} posts (${result.status})`);
          }
        } catch (err) {
          console.error(`[ViralPosts] warmup ${keyword} skipped:`, String((err as any)?.message || err).slice(0, 160));
        }
        setTimeout(warmNext, 60_000); // 1/min keeps engines un-challenged
      };
      setTimeout(warmNext, 5_000);
    }
  }
}
