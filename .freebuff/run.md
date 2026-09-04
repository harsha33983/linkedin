# LinkedGrow AI — Run Instructions

## How to Reproduce Uncommitted Artifacts

1. Copy `.env.local` from the main checkout (contains Neon DATABASE_URL and config)
2. Copy `.env` from the main checkout (Prisma CLI reads `.env`, not `.env.local`)
3. Install dependencies: `npm install`
4. Generate Prisma client: `npx prisma generate`

### Neon DB Setup
- Database: `neondb` on `ep-floral-cherry-ae3qfpql-pooler.c-2.us-east-2.aws.neon.tech`
- Schema pushed via `npx prisma db push` (13 tables)
- Uses `@prisma/adapter-neon` + `@neondatabase/serverless` for serverless connections
- `app/actions.ts` provides direct SQL helpers via Neon's serverless driver

### Auth (Better Auth + Neon — real users)
- Sign in / sign up use **Better Auth against the Neon DB** (`user`, `session`, `account`, `verification` tables). No mock users — accounts persist in Neon.
- Session cookie: `better-auth.session_token` (HttpOnly). The login/signup pages POST to Better Auth's native endpoints `/api/auth/sign-in/email` and `/api/auth/sign-up/email` (catch-all `[...all]` route).
- Sign out: `POST /api/auth/sign-out` (revokes the server session + clears cookies).
- Known drift fix: if Better Auth errors with "column does not exist" (e.g. `account.issuer` or `createdAt`/`updatedAt` on `account`/`session`), add the columns via ALTER TABLE — the tables predate the current better-auth version.
- A legacy `linkedgrow_session=mock_*` cookie fallback still exists inside `get-session` for local dev only.
- Dev convenience account (real Neon user): `preview.test@example.com` / `Password123!`

## How to Run the Server

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Start dev server on port 3001
npx next dev -p 3001
```

Or use npm scripts:
```bash
npm run dev  # defaults to port 3000, use -p 3001 if needed
```

### Connecting to Neon DB (Production Mode)
```bash
# Set USE_MOCK_DB=false in .env.local, then:
npx prisma db push    # Push schema changes to Neon
npx prisma db seed    # Seed with initial data (optional)
```

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
