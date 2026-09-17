/** One-off: GET /api/viral-posts for a brand-new keyword (banner regression test). */
const BASE = "http://localhost:3001";

async function main() {
  const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: "preview.test@example.com", password: "Password123!" }),
  });
  const setCookie = login.headers.get("set-cookie") || "";
  const m = setCookie.match(/[^\s;,]+=[^\s;,]+/);
  const cookie = m ? m[0] : "";
  console.log("login:", login.status, cookie ? "cookie ok" : "NO COOKIE");

  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/viral-posts?keyword=blockchain&days=7&limit=8`, {
    headers: { cookie },
  });
  console.log("viral-posts:", res.status, "in", ((Date.now() - t0) / 1000).toFixed(1) + "s");
  const d = await res.json();
  console.log("status:", d.status, "| total:", d.total ?? d.posts?.length, "| notice:", d.notice ?? null);
  for (const p of (d.posts || []).slice(0, 8)) {
    console.log(`  score=${p.viralScore?.toFixed?.(1) ?? p.viralScore} r=${p.reactions} c=${p.comments} ${(p.publishedAt || "None").slice(0, 10)} ${p.authorName}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
