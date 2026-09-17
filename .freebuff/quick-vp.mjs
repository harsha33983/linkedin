const BASE = "http://localhost:3001";
const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: BASE },
  body: JSON.stringify({ email: "viral-test@example.com", password: "test12345" }),
});
const setCookie = login.headers.get("set-cookie") || "";
const m = setCookie.match(/better-auth\.session_token=[^;]+/);
console.log("login:", login.status, m ? "cookie ok" : "NO COOKIE");
const vp = await fetch(`${BASE}/api/viral-posts?keyword=startups&days=14&limit=6`, { headers: { cookie: m ? m[0] : "" } });
const d = await vp.json();
console.log("viral-posts:", vp.status, "| status:", d.status, "| total:", d.total, "| notice:", d.notice ?? "(none)");
for (const p of (d.data || []).slice(0, 4)) {
  console.log("  -", (p.author?.name || "?").slice(0, 24), "| rx", p.reactions, "| score", p.viralScore, "|", (p.content || "").slice(0, 50));
}
