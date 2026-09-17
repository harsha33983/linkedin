/** Test edit learning end-to-end. */
const BASE = "http://localhost:3001";

async function main() {
  const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: "preview.test@example.com", password: "Password123!" }),
  });
  const setCookie = login.headers.get("set-cookie") || "";
  const cookie = (setCookie.match(/[^\s;,]+=[^\s;,]+/) || [""])[0];
  if (!cookie) { console.log("no cookie"); process.exit(1); }

  // First: a generation so a real generationId exists
  const gen = await fetch(`${BASE}/api/ai/generate-post`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie, Origin: BASE },
    body: JSON.stringify({ topic: "hiring your first support engineer", format: "Lesson learned", length: "short" }),
  });
  const gd = await gen.json();
  const generationId = gd?.data?.generationId;
  console.log("gen:", gen.status, "id:", generationId ? "ok" : "missing");

  // Simulate a meaningful user edit: AI cliché removed, opener shortened
  const aiDraft = "I'm excited to share what I've learned about hiring support engineers.\n\nHiring is a game changer for scaling your support team, and here are my thoughts on the whole process from start to finish.";
  const final = "Our first support hire quit in 11 days.\n\nI wrote a job post nobody qualified for.";
  const res = await fetch(`${BASE}/api/ai/edit-learning`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie, Origin: BASE },
    body: JSON.stringify({ generationId, versionId: "v1", aiDraft, final }),
  });
  console.log("edit-learning:", res.status, JSON.stringify(await res.json()));
}
main();
