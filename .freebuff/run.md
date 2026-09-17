# LinkedGrow AI — Run Instructions

## How to Reproduce Uncommitted Artifacts

1. Copy `.env.local` from the main checkout (contains Neon DATABASE_URL, Better Auth secret, AI keys, LinkedIn OAuth credentials, Redis URL, token encryption key)
2. Copy `.env` from the main checkout (fallback env used by some tooling — Prisma CLI reads `.env`, not `.env.local`)
3. Install dependencies: `npm install` (already done in this worktree — node_modules present)

> Prisma note: this project does NOT use Prisma at runtime. Database access is direct via `@neondatabase/serverless` (`src/lib/db.ts` → `sql`). The run steps above mentioning `npx prisma generate` / `npx prisma db push` are stale — they do not apply here.

### Neon DB Setup
- Database: `neondb` on `ep-floral-cherry-ae3qfpql-pooler.c-2.us-east-2.aws.neon.tech`
- Connections are made directly via `@neondatabase/serverless` (`sql` helper in `src/lib/db.ts`) — the project does NOT use Prisma at runtime (no `schema.prisma` on disk, no Prisma client generated).
- `src/app/actions.ts` provides higher-level SQL helpers via the same `sql` driver.
- `.env.local` sets `USE_MOCK_DB=false`, so the server authenticates and reads/writes real Neon data.

### Auth (Better Auth + Neon — real users)
- Sign in / sign up use **Better Auth against the Neon DB** (`user`, `session`, `account`, `verification` tables). No mock users — accounts persist in Neon.
- Session cookie: `better-auth.session_token` (HttpOnly). The login/signup pages POST to Better Auth's native endpoints `/api/auth/sign-in/email` and `/api/auth/sign-up/email` (catch-all `[...all]` route).
- Sign out: `POST /api/auth/sign-out` (revokes the server session + clears cookies).
- Known drift fix: if Better Auth errors with "column does not exist" (e.g. `account.issuer` or `createdAt`/`updatedAt` on `account`/`session`), add the columns via ALTER TABLE — the tables predate the current better-auth version.
- A legacy `linkedgrow_session=mock_*` cookie fallback still exists inside `get-session` for local dev only.
- When `USE_MOCK_DB=true`, Better Auth is replaced by a lightweight mock session layer; `false` uses real Neon auth.
- Dev convenience account (real Neon user): `preview.test@example.com` / `Password123!`

## How to Run the Server

```bash
# Install dependencies (only needed if node_modules is missing)
npm install

# Start dev server on port 3001
npm run dev
# or: npx next dev -p 3001
```

### Viral Posts cache (Trending LinkedIn Posts)
- Scraper service: `scraper-service/` (Python/Scrapling) — start detached with `powershell -NoProfile -File .freebuff/restart-scraper.ps1`; health at `http://127.0.0.1:8100/health`.
- Cache layers: Postgres central cache (`viral_posts` + `scraper_cache`, timestamptz columns) with stale-while-revalidate in `GET /api/viral-posts` — cached rows always serve instantly, refresh runs in the background (single-flight).
- Warmup: `src/instrumentation.ts` stagger-warms every UI chip keyword (AI, SaaS, Marketing, Startups, Career, Leadership, Productivity) at 14d — first keyword 5s after boot, then one per minute so search engines stay un-challenged. Set `VIRAL_POSTS_WARMUP=off` to disable, `VIRAL_POSTS_DEFAULT_KEYWORD` to prepend a different first keyword.
- Engine cooldowns: when a search engine (Brave/Google/DDG) serves a challenge, the scraper skips it for 5 min. If ALL engines are cooling, it still force-probes Brave once rather than returning zero URLs.
- Env: `SCRAPER_MODE` (`scrapling` | `mock`), `SCRAPER_CACHE_TTL_MINUTES` (30), `SCRAPER_TIMEOUT_MS` (300000).

Or use npm scripts:
```bash
npm run dev  # defaults to port 3000, use -p 3001 if needed
```

### Neon DB (Production Mode)
- Ensure `USE_MOCK_DB=false` in `.env.local` (already the case here).
- Schema lives directly in Neon; no Prisma migration tooling is used by this app.

## Available Routes (51 total)

### Public
- `/` — Landing page
- `/pricing` — Pricing comparison (Free vs Creator)
- `/login` / `/signup` — Authentication

### App (requires session)
- `/dashboard` — Overview with stats, recent content, LinkedIn status
- `/onboarding` — 5-step onboarding (Identity → Expertise → Audience → Goals → Voice Sliders)
- `/create/ai-post` — AI Post Generator (3 versions, edit, rejection capture)
- `/create/hooks` — Hook Generator (8 categories, voice-fit scoring)
- `/create/rewrite` — Rewrite tool (side-by-side comparison)
- `/create/analyze` — Post Analyzer (quality checks)
- `/content` — Content Library (search, filter, status tabs)
- `/content/drafts` — Draft posts
- `/content/ideas` — Content Ideas (with suggestion reasons)
- `/calendar` — Content Calendar (week/month views)
- `/voice-dna` — Voice DNA (confidence badge, sliders, samples, confirm)
- `/settings/profile` — Profile settings
- `/settings/ai-preferences` — AI defaults
- `/settings/billing` — Plan comparison
- `/settings/account` — Password, account deletion
- `/settings/data-export` — Full JSON export
- `/settings/linkedin` — LinkedIn Connect, publish schedule
