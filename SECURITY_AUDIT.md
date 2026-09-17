# Security Audit

**Project:** LinkedGrow AI (Next.js 14 App Router SaaS — LinkedIn content operating system)
**Date:** 2026-09-05
**Scope:** Full architecture review + hardening of authentication, authorization, tokens,
API routes, queues, and infrastructure.

---

## Architecture Assessment

The application is a **Next.js 14 App Router** monolith. The "backend" is Next.js
**API Route Handlers** under `src/app/api/**` plus a handful of Server Actions
(`src/app/actions.ts`). There is **no separate Express/NestJS/Fastify service** — there
is no architectural requirement to add one. The provider abstractions
(`@/lib/ai/types.ts` AIProvider, the `ProfileDataProvider` interface, `ProfileDataService`)
are already designed so business logic can be lifted into a future service without
rewrite.

**Backing stores:** Neon Postgres (`@neondatabase/serverless` via `sql` in `src/lib/db.ts`
and a `Pool` in `better-auth`), Redis/BullMQ (`ioredis` + `bullmq` — though `queue/connection.ts`
is currently a hard-coded dev no-op pointing at `localhost:6379`), `crypto-js`-style token
encryption via Node `crypto`.

**Security posture:** The route layer is *mostly* authorization-correct (every resource
query filters by `"userId" = $currentUser`), but there are **two critical**
vulnerabilities and several high/medium gaps that must be closed before this is
production-ready. The single most dangerous issue is a **full authentication bypass**
(CRITICAL-1) that lets an unauthenticated attacker impersonate users in production.

---

## Critical

### CRITICAL-1 — Production authentication bypass via unguarded mock auth
- **File:** `src/lib/auth/get-session.ts`, `src/lib/auth/mock.ts`
- **Severity:** Critical
- **Vulnerability:** Every session helper (`getSession`, `getSessionFromRequest`,
  `requireAuth`, `requireAuthFromRequest`) unconditionally falls back to the **mock**
  auth path when Better Auth returns no session. `getMockSessionByToken` will
  reconstruct a session for **any** token starting with `mock_`, and — critically —
  if the token doesn't decode to a known user it **defaults to `MOCK_USER`
  (`user_mock_001`)**. So a request with any cookie such as
  `linkedgrow_session=mock_1_foo` is authenticated as `user_mock_001`; a cookie of
  the form `mock_ts_rand_<userId>` authenticates as **that** user.
- **Attack scenario:** Unauthenticated attacker sends `Cookie: linkedgrow_session=mock_x`
  to any protected API route (`/api/posts`, `/api/linkedin/connect`,
  `/api/ai/generate-post`, …). They are treated as a valid, logged-in user — full
  account takeover of the demo user, and impersonation of any user whose id is known.
  This entirely defeats authentication.
- **Why dangerous:** It is not gated by `USE_MOCK_DB` or `NODE_ENV`. Mock auth is
  reachable in production builds. The fallback in `get-session.ts` runs whenever
  Better Auth is bypassed or misconfigured — exactly the case an attacker wants.
- **Fix:** Enable mock auth **only** when `USE_MOCK_DB === "true"` (dev/local). Remove
  the "default to MOCK_USER" reconstruction and the token→user-id forge path. In all
  other environments, the mock path returns `null`, so `requireAuthFromRequest` throws
  `Unauthorized`.
- **Breaking:** No. (Dev flows that relied on mock can set `USE_MOCK_DB=true`.)

### CRITICAL-2 — Server-Side Request Forgery (SSRF) via user-controlled image URL
- **File:** `src/lib/linkedin/publishing.ts` (`uploadImageToLinkedIn`, line ~504),
  `src/app/api/posts/route.ts` (POST/PATCH store user `imageUrl` unabated)
- **Severity:** Critical
- **Vulnerability:** `uploadImageToLinkedIn` does `await fetch(imageUrl)` where
  `imageUrl` comes straight from the post row. The post-create/PATCH API accepts any
  string for `imageUrl` (no URL validation). Publishing is triggered by the user
  themselves, so an authenticated user can point `imageUrl` at an **internal** address
  and force the server to make the request when the post is published.
- **Attack scenario:** Set `imageUrl = "http://169.254.169.254/latest/meta-data/iam/security-credentials/"`,
  then call `POST /api/posts/[id]/publish`. The server fetches the cloud metadata
  endpoint (or any internal service) — SSRF that returns cloud credentials / internal
  data into the post's image pipeline or logs.
- **Why dangerous:** The server runs inside the deployment network. It can reach
  metadata endpoints, internal DBs/Redis, and admin services. Also enabled for
  **scheduled** posts, so it can fire without an interactive publish click.
- **Fix:** Validate `imageUrl` server-side (allow only `http(s)` + a small allowlist of
  public hosts: the app's own uploaded-asset origin, `images.unsplash.com`), block
  private/loopback/link-local/metadata ranges, and harden the fetch in
  `uploadImageToLinkedIn` to reject non-allowlisted URLs before fetching.
- **Breaking:** No.

---

## High

### HIGH-1 — No server-side rate limiting on most AI/auth/publish endpoints
- **Files:** `src/app/api/ai/analyze-post`, `rewrite`, `generate-hooks`,
  `generate-image`, `generate-ideas` (no limit), `src/lib/rate-limit/limiter.ts`
  (in-memory only), `posts/[id]/publish`, `queue/[id]/publish-now`
- **Severity:** High
- **Vulnerability:** Only `generate-post` calls `checkRateLimit`, and that limiter is
  an **in-memory Map** — not shared across serverless instances and resets on restart.
  The remaining AI endpoints and all publish/queue paths are unlimited.
- **Attack scenario:** A single user can spam `POST /api/ai/generate-post` (and even
  more cheaply `rewrite`/`analyze-post`/`generate-image`) to burn AI quota/credits, or
  spam publish to flood the LinkedIn pipeline. No brute-force protection exists on
  sign-in either.
- **Fix:** Add a Redis-backed rate limiter (falling back to in-memory when Redis is
  absent) and apply it to AI generation, auth endpoints, publishing, and the
  profile-review tool. Distinguish user-keyed and IP-keyed limits.
- **Breaking:** No.

### HIGH-2 — No security headers (CSP, HSTS, X-Frame-Options, etc.)
- **File:** `next.config.mjs`
- **Severity:** High
- **Vulnerability:** No `headers()` config. No `Content-Security-Policy`,
  `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, or `X-Frame-Options`.
- **Why:** Defaults leave the app without clickjacking/type-sniffing protection and no
  CSP to constrain injected markup.
- **Fix:** Add a `headers()` block in `next.config.mjs` with a production-appropriate
  CSP (allowing the app's own scripts/styles + Unsplash images) and the other headers.
- **Breaking:** No — but CSP must be tuned to not break the app's inline scripts/styles.

### HIGH-3 — LinkedIn token encryption is unauthenticated AES-CBC
- **File:** `src/lib/encryption/tokens.ts`
- **Severity:** High
- **Vulnerability:** Uses AES-256-**CBC** with no HMAC/GCM (no authentication tag),
  and a single shared key with random IV stored alongside. CBC is not
  authenticity-protected (malleable ciphertext), and the key has no rotation/versioning.
  Modes like CBC are fine for confidentiality but not tamper-resistance; a DB leak
  yields tokens, and ciphertext can be manipulated.
- **Fix:** Switch to **AES-256-GCM** (authenticated encryption, random 12-byte IV,
  auth tag), add a key-version prefix so the key can be rotated, and keep a
  backward-compat read path for rows already encrypted with CBC.
- **Breaking:** Read-compatible; new writes use GCM.

### HIGH-4 — Better Auth configuration is un-hardened
- **File:** `src/lib/auth/server.ts`
- **Severity:** High
- **Vulnerability:** No `secret`/`trustedOrigins`/cookie policy specified beyond
  defaults; `requireEmailVerification: false`; no explicit session cookie
  `secure`/`sameSite` overrides; `database: new Pool(...)`. Relying on better-auth
  defaults for `secret`, origin checks, and cookie flags is fragile.
- **Fix:** Set `secret` from `BETTER_AUTH_SECRET`, `trustedOrigins` from
  `NEXT_PUBLIC_APP_URL`, explicit session cookie `{ httpOnly, secure (prod),
  sameSite: "lax" }`, and `advanced.crossSubDomainCookies` off.
- **Breaking:** No.

---

## Medium

### MEDIUM-1 — Missing XSS hardening on AI-rendered output
- **File:** `src/app/tools/linkedin-profile-review/page.tsx` (uses
  `dangerouslySetInnerHTML` for JSON-LD only — **safe**, it's static trusted markup)
- **Severity:** Medium (informational)
- **Finding:** AI-generated post content is rendered as React text nodes (auto-escaped),
  which is safe. The single `dangerouslySetInnerHTML` is static JSON-LD, not user
  input. Recommend a CSP (HIGH-2) as defense-in-depth and keeping content as text.

### MEDIUM-2 — In-memory rate limits and profile-review limits not distributed
- **Files:** `src/lib/rate-limit/limiter.ts`, `src/lib/profile-review/limits.ts`
- **Severity:** Medium
- **Finding:** Both use `Map` in-memory; fine for a single instance, ineffective across
  serverless/scale-out. Combine with the Redis-backed limiter work in HIGH-1.

### MEDIUM-3 — `getClientIp` trusts `x-forwarded-for`
- **File:** `src/lib/profile-review/limits.ts`
- **Severity:** Medium
- **Finding:** Grabs the first `x-forwarded-for` entry unvalidated; a client can spoof
  its IP to reset the anonymous profile-review limit. Use the platform-provided
  real-IP header and only trust XFF when set by a trusted proxy.

### MEDIUM-4 — Scheduler runs in-process (no distributed lock)
- **File:** `src/instrumentation.ts`, `src/lib/scheduler/publisher.ts`
- **Severity:** Medium
- **Finding:** `startScheduler()` runs per process via `setInterval`. With multiple
  instances the same due post can be picked up by several ticks (the comment even
  notes this). The `publishLockId` idempotency check mitigates duplicates, but the
  cron is not leader-elected. Recommend a Redis/distributed lock or a BullMQ repeatable
  job.

### MEDIUM-5 — No audit log for auth failures / token refresh failures
- **File:** `src/lib/audit/service.ts` (has events for publish/connect/disconnect only)
- **Severity:** Medium
- **Finding:** No events for failed login, token-refresh failure, or rate-limit denial.
  Add these to the audit trail.

---

## Low

- **LOW-1:** `schema.sql` may contain seed/test rows; ensure no test secrets.
- **LOW-2:** `USE_MOCK_DB` is documented but `db.ts` always uses `neon(DATABASE_URL)`;
  the flag currently only gates nothing at the DB layer. Align into the mock gate.
- **LOW-3:** Route params (`[id]`) are validated in each handler but a shared param
  schema would reduce drift.
- **LOW-4:** `getValidAccessToken` returns plaintext token mid-function (never returned
  to the client) — acceptable, but ensure it's never logged. Not currently logged.
- **LOW-5:** `next.config.mjs` `serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist"]`
  is fine for PDF review parsing; verify those parsers are pinned.

---

## Fixes Implemented

1. **CRITICAL-1:** Gated all mock-auth fallback behind `USE_MOCK_DB === "true"`;
   removed the "default to MOCK_USER" forge path. In production, unauthenticated
   requests now correctly 401.
2. **CRITICAL-2:** Added server-side `imageUrl` validation (allowlist public hosts:
   app's upload origin + `images.unsplash.com`; block private/loopback/metadata IPs)
   and hardened `uploadImageToLinkedIn` to reject non-allowlisted URLs before fetch.
3. **HIGH-1:** Added a Redis-backed rate limiter (`src/lib/rate-limit/redis-limiter.ts`)
   with in-memory fallback; wired it into AI generation, publishing, auth, and the
   profile-review tool.
4. **HIGH-2:** Added a `headers()` block in `next.config.mjs` with CSP, HSTS,
   `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and
   `X-Frame-Options`.
5. **HIGH-3:** Upgraded LinkedIn token encryption to AES-256-GCM with a key-version
   prefix and backward-compatible CBC read.
6. **HIGH-4:** Hardened better-auth config (`secret`, `trustedOrigins`, explicit
   cookie policy).

---

## Remaining Risks

- In-process scheduler has no distributed leader lock (MEDIUM-4) — mitigated by the
  `publishLockId` idempotency check, but should move to a Redis lock before scale-out.
- The Redis rate limiter falls back to in-memory when Redis is unreachable; ensure Redis
  is always present in production for true distributed limiting.
- CSP is set conservatively; verify it doesn't break third-party script injection after
  any additions.

## Next Steps

- Enforce `BETTER_AUTH_SECRET` >= 32 bytes and rotate `TOKEN_ENCRYPTION_KEY` in secret
  manager.
- Add auth-failure + token-refresh-failure audit events.
- Move the cron scheduler to a leader-elected / BullMQ repeatable job.
- Add a migration to backfill any old CBC tokens to GCM.
