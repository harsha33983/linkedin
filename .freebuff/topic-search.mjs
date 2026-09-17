const BASE = "http://localhost:3001";
const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: BASE },
  body: JSON.stringify({ email: "viral-test@example.com", password: "test12345" }),
});
const m = (login.headers.get("set-cookie") || "").match(/better-auth\.session_token=[^;]+/);
// Fresh topic a user might type — multi-word, no cache
for (const topic of ["remote work", "hiring"]) {
  const t0 = Date.now();
  const vp = await fetch(`${BASE}/api/viral-posts?keyword=${encodeURIComponent(topic)}&days=14&limit=6`, { headers: { cookie: m ? m[0] : "" } });
  const d = await vp.json();
  console.log(`"${topic}": ${vp.status} in ${Math.round((Date.now()-t0)/1000)}s | status: ${d.status} | total: ${d.total}`);
  for (const p of (d.data || []).slice(0, 3)) console.log("   -", (p.author?.name||"?").slice(0,24), "| rx", p.reactions, "| score", p.viralScore);
}
