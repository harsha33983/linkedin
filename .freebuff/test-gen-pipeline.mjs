/** E2E: full post generation through the new AI pipeline (router → structure → humanizer → quality). */
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
  if (!cookie) process.exit(1);

  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/ai/generate-post`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie, Origin: BASE },
    body: JSON.stringify({
      topic: "migrating a SaaS app to serverless Postgres",
      format: "Lesson learned",
      length: "medium",
      whatHappened: "We moved 14 services over 3 weekends and connection pooling broke everything on day one",
      whatLearned: "Serverless Postgres needs a pooler in front of it or every lambda eats a connection",
      result: "P95 query latency dropped 320ms and our bill fell 40%",
    }),
  });
  console.log("generate:", res.status, "in", ((Date.now() - t0) / 1000).toFixed(1) + "s");
  const d = await res.json();
  if (!d.success) { console.log("error:", d.error); process.exit(1); }

  const r = d.data;
  console.log("model:", r.metadata?.model, "| versions:", r.versions?.length);
  for (const v of r.versions || []) {
    console.log(`--- ${v.label} (quality: spec=${v.quality?.specificity} orig=${v.quality?.originality} risk=${v.quality?.aiPatternRisk})`);
    console.log(v.content.split("\n").slice(0, 3).join(" / "));
  }
}

main();
