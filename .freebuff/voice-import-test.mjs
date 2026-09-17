const BASE = "http://localhost:3001";

async function signIn(email, password) {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  const cookies = res.headers.getSetCookie?.() || [];
  const jar = cookies.map((c) => c.split(";")[0]).join("; ");
  if (!jar) throw new Error(`sign-in failed: ${res.status}`);
  return jar;
}

const email = process.argv[2] || "viral-test@example.com";
const password = process.argv[3] || "test12345";
const jar = await signIn(email, password);
console.log("signed in as", email);

// What does the API report as importable?
const voice = await fetch(`${BASE}/api/voice`, { headers: { cookie: jar } }).then(r => r.json());
console.log("autoImport meta:", JSON.stringify(voice.meta?.autoImport));

// Trigger the import (same endpoint the UI button uses)
const imp = await fetch(`${BASE}/api/voice/analyze-linkedin`, {
  method: "POST",
  headers: { cookie: jar, "Content-Type": "application/json" },
}).then(r => r.json());

if (imp.success) {
  console.log(`imported OK: postsFound=${imp.data.postsFound} newSamples=${imp.data.newSamplesAdded} totalSamples=${imp.data.totalSamples} tier=${imp.data.confidenceTier}`);
} else {
  console.log("import response:", imp.success === false ? imp.error : JSON.stringify(imp).slice(0, 200));
}
