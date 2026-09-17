const BASE = "http://localhost:3001";
for (const c of [
  { email: "viral-test@example.com", password: "test12345" },
  { email: "preview.test@example.com", password: "Password123!" },
]) {
  const r = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify(c),
  });
  console.log(c.email, "→", r.status, r.status === 200 ? "OK" : "FAIL");
}
