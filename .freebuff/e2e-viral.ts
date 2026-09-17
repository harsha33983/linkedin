/**
 * E2E: login → GET /api/viral-posts (triggers live ScrapeGraphAI scrape)
 * → POST /api/content-ideas/generate on the top post.
 * Usage: npx tsx .freebuff/e2e-viral.ts
 */
const BASE = "http://localhost:3001";

async function main() {
  // 1. Sign in via Better Auth (fresh test account created earlier)
  const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: "viral-test@example.com", password: "test12345" }),
  });
  const setCookie = login.headers.get("set-cookie") || "";
  const m = setCookie.match(/better-auth\.session_token=[^;]+/);
  const cookie = m ? m[0] : "";
  console.log("login:", login.status, cookie ? "cookie ok" : "NO COOKIE", "status-text:", login.statusText);

  // 2. Viral posts (live scrape on cold cache — may take minutes)
  console.log("fetching /api/viral-posts?keyword=AI (live scrape, be patient)…");
  const t0 = Date.now();
  const vp = await fetch(`${BASE}/api/viral-posts?keyword=AI&days=14&limit=6`, {
    headers: { cookie },
  }).catch((e) => ({ json: async () => ({ success: false, notice: String(e?.cause?.code || e) }) } as any));
  const vpData = await vp.json();
  console.log(`viral-posts: ${vp.status} in ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log("  status:", vpData.status, "| total:", vpData.total, "| mode:", vpData.mode);
  if (!vpData.success || vpData.data?.length === 0) {
    console.log("  notice:", vpData.notice || "(none)");
    process.exit(1);
  }
  for (const p of vpData.data.slice(0, 4)) {
    console.log(`  - ${(p.author?.name || "?").slice(0, 22)} | rx ${p.reactions} | score ${p.viralScore} | ${(p.content || "").slice(0, 60)}`);
  }

  // 3. Use-this-post → analysis + 5 original ideas
  const top = vpData.data[0];
  console.log("generating ideas for top post…");
  const t1 = Date.now();
  const gen = await fetch(`${BASE}/api/content-ideas/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ postId: top.id }),
  });
  const genData = await gen.json();
  console.log(`ideas: ${gen.status} in ${Math.round((Date.now() - t1) / 1000)}s | usedAi: ${genData.meta?.usedAi} | model: ${genData.meta?.model}`);
  if (genData.success) {
    console.log("  hookPattern:", genData.data.analysis.hookPattern);
    for (const idea of genData.data.ideas.slice(0, 3)) {
      console.log("  💡", idea.title?.slice(0, 70));
    }
  } else {
    console.log("  error:", genData.error);
  }
}
main();
