# LinkedGrow AI — Phased Technical Implementation Plan

**Derived from:** PRD v2.0
**Date:** August 31, 2026
**Approach:** 5 phases, each independently shippable, sequenced so the compounding moat (Voice DNA + feedback loop) ships in Phase 1.

---

## Guiding Principles

1. **Voice DNA confidence scoring and rejection-reason capture ship in Phase 1** — the retention thesis (§5.2) depends on these existing from day one.
2. **AI provider is abstracted from day one** — never hard-code to OpenAI; a thin provider interface lets us swap models for cost, quality, or safety reasons (§11).
3. **Core value (Voice DNA + generation) works 100% without LinkedIn API** — LinkedIn integration is a strict upgrade, not a blocker (§16).
4. **Single-user data model, 1:1 VoiceProfile-to-User** — no agency/multi-voice assumptions (§17).
5. **Every generation stores traceability metadata** — `voiceDnaVersionUsed` and `rejectionReason` are first-class, not afterthoughts (§12).

---

## Tech Stack (from §11)

| Layer | Choice |
|---|---|
| Framework | Next.js 14+ (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | Better Auth (self-hosted, no vendor lock-in) |
| AI | Provider-agnostic interface (OpenAI API initially) |
| Validation | Zod |
| Background Jobs | BullMQ + Redis |
| Storage | Cloudflare R2 (S3-compatible) |
| Deployment | Vercel (frontend) + Railway (API workers + Postgres) |

---

# PHASE 1: Foundation + Voice DNA Core

**Goal:** Ship the compounding moat — Voice DNA with confidence scoring, user confirmation, and rejection-reason capture — plus all supporting infrastructure.
**Duration estimate:** 3–4 weeks
**Deploys as:** Internal alpha (functional end-to-end, no polish)

---

## 1.1 Project Scaffolding

### Task: Initialize Next.js project with full toolchain

**Files to create:**
```
/
├── .env.example
├── .env.local
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.js
├── package.json
├── components.json (shadcn/ui)
└── src/
    ├── app/
    │   ├── layout.tsx (root layout)
    │   ├── page.tsx (landing)
    │   └── globals.css
    ├── lib/
    │   └── utils.ts
    ├── components/
    │   └── ui/ (shadcn components)
    └── types/
        └── index.ts
```

**Dependencies:**
```json
{
  "dependencies": {
    "next": "^14.0",
    "react": "^18.0",
    "react-dom": "^18.0",
    "@prisma/client": "^5.0",
    "zod": "^3.22",
    "better-auth": "^1.0",
    "openai": "^4.0",
    "bullmq": "^5.0",
    "ioredis": "^5.0",
    "date-fns": "^3.0",
    "lucide-react": "^0.400"
  },
  "devDependencies": {
    "prisma": "^5.0",
    "typescript": "^5.4",
    "@types/node": "^20",
    "@types/react": "^18",
    "tailwindcss": "^3.4",
    "postcss": "^8",
    "autoprefixer": "^10",
    "eslint": "^8",
    "eslint-config-next": "^14"
  }
}
```

**Acceptance criteria:**
- `npm run dev` starts without errors
- `npm run build` completes successfully
- Tailwind + shadcn/ui components render
- TypeScript strict mode enabled

---

## 1.2 Database Schema (Prisma)

### Task: Define complete database schema per §12

**File:** `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Authentication ───────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  profile          UserProfile?
  voiceProfile     VoiceProfile?
  writingSamples   WritingSample[]
  posts            Post[]
  ideas            ContentIdea[]
  generations      Generation[]
  linkedinConnection LinkedInConnection?
  publishSchedule  PublishSchedule?
  publishLogs      PublishLog[]
  onboardingHistory OnboardingSnapshot[]

  @@map("users")
}

model UserProfile {
  id              String   @id @default(cuid())
  userId          String   @unique
  occupation      String?  // identity: Founder/Creator/Freelancer/etc.
  expertise       String[] // multi-select + custom
  targetAudience  String[] // multi-select + custom
  linkedinGoals   String[] // multi-select
  preferences     Json?    // voice sliders + other prefs

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_profiles")
}

// ─── Voice DNA ────────────────────────────────────────────────

model VoiceProfile {
  id              String   @id @default(cuid())
  userId          String   @unique
  version         Int      @default(1)
  confidenceScore Float    @default(0.0) // 0.0–1.0
  sampleCount     Int      @default(0)
  userConfirmed   Boolean  @default(false)
  lastUpdated     DateTime @updatedAt

  // Voice dimensions
  tone            Json     // ["conversational", "direct"]
  sentenceStyle   String?  // "short", "short-medium", "medium", "long"
  paragraphStyle  String?  // "short", "medium", "long"
  hookPatterns    Json     // ["contrarian", "story"]
  ctaStyle        String?  // "question", "statement", "soft-cta"
  emojiUsage      String?  // "none", "low", "moderate", "high"
  commonTopics    Json     // ["AI", "startups"]
  wordsToAvoid    String[]
  writingPatterns Json     // structured analysis output
  sourceWeighting Json?    // { "linkedin_post": 1.0, "blog": 0.6, "other": 0.4 }

  // Metadata
  metadata        Json?    // raw AI analysis, full response

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("voice_profiles")
}

model VoiceProfileVersion {
  id              String   @id @default(cuid())
  userId          String
  version         Int
  snapshot        Json     // full VoiceProfile snapshot at this version
  triggerReason   String   // "sample_added", "sample_deleted", "manual_reanalyze", "user_edit"
  createdAt       DateTime @default(now())

  @@unique([userId, version])
  @@index([userId])
  @@map("voice_profile_versions")
}

model WritingSample {
  id         String   @id @default(cuid())
  userId     String
  content    String
  source     String?  // "linkedin_post", "blog", "email", "slack", "other"
  sourceType String?  // freeform tag
  weight     Float    @default(1.0) // computed from source type
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("writing_samples")
}

// ─── Onboarding ───────────────────────────────────────────────

model OnboardingSnapshot {
  id        String   @id @default(cuid())
  userId    String
  step      Int      // 1–5
  data      Json     // snapshot of answers at this step
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("onboarding_snapshots")
}

// ─── Content ──────────────────────────────────────────────────

model Post {
  id                 String   @id @default(cuid())
  userId             String
  title              String?
  content            String
  topic              String?
  format             String?  // Educational, Personal story, Contrarian, etc.
  status             PostStatus @default(DRAFT) // DRAFT, SAVED, APPROVED, SCHEDULED, PUBLISHED, ARCHIVED
  scheduledAt        DateTime?
  publishedAt        DateTime?
  voiceDnaVersionUsed Int?    // traceability: which Voice DNA version was used
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  publishLogs   PublishLog[]
  performanceSignals PerformanceSignal[]

  @@index([userId, status])
  @@index([userId])
  @@map("posts")
}

enum PostStatus {
  DRAFT
  SAVED
  APPROVED
  SCHEDULED
  PUBLISHED
  ARCHIVED
}

model ContentIdea {
  id              String   @id @default(cuid())
  userId          String
  title           String
  description     String?
  topic           String?
  format          String?
  status          String   @default("active") // active, hidden, dismissed
  suggestionReason String? // "Because you haven't posted about pricing strategy..."
  dismissedAt     DateTime?
  createdAt       DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, status])
  @@map("content_ideas")
}

// ─── AI Generation & Feedback ─────────────────────────────────

model Generation {
  id                  String   @id @default(cuid())
  userId              String
  type                String   // "post", "hook", "idea", "rewrite", "voice_analysis"
  input               Json     // the prompt/params sent
  output              Json     // generated result(s)
  model               String?  // "gpt-4o", etc.
  voiceDnaVersionUsed Int?     // traceability
  rejectionReason     String?  // "wrong_tone", "not_my_experience", "too_generic", "wrong_format", "other"
  rejectedAt          DateTime?
  createdAt           DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, type])
  @@index([userId, createdAt])
  @@map("generations")
}

// ─── Performance (stub for V1.2) ─────────────────────────────

model PerformanceSignal {
  id        String   @id @default(cuid())
  postId    String
  metric    String   // "views", "likes", "comments", "reposts"
  value     Float
  capturedAt DateTime @default(now())

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([postId])
  @@map("performance_signals")
}

// ─── LinkedIn Integration (Phase 4) ──────────────────────────

model LinkedInConnection {
  id               String   @id @default(cuid())
  userId           String   @unique
  accessToken      String   // encrypted at rest via app-level encryption
  refreshToken     String   // encrypted at rest
  expiresAt        DateTime
  scopes           String[]
  linkedInMemberId String?
  status           String   @default("active") // active, expired, revoked
  connectedAt      DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("linkedin_connections")
}

model PublishSchedule {
  id          String   @id @default(cuid())
  userId      String   @unique
  mode        String   @default("manual") // manual, approved_queue, full_auto
  postingTime String?  // "09:00" — time of day
  postingDays Int[]    // 0=Sun..6=Sat
  maxPerDay   Int      @default(1)
  isPaused    Boolean  @default(false)
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("publish_schedules")
}

model PublishLog {
  id          String   @id @default(cuid())
  postId      String
  userId      String
  publishedAt DateTime @default(now())
  approvedBy  String?  // "user", "auto_queue", "full_auto"
  approvedAt  DateTime?
  status      String   // "success", "failed", "retrying"
  errorMessage String?

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("publish_logs")
}
```

**Acceptance criteria:**
- `prisma db push` succeeds against local Postgres
- `prisma generate` produces client without errors
- All relations resolve correctly (test with seed script)
- `PostStatus` enum includes `APPROVED` for Feature 9 queue

---

## 1.3 Authentication

### Task: Implement auth with Better Auth

**Files:**
```
src/lib/auth.ts           — Better Auth config
src/lib/auth-client.ts    — client-side auth helpers
src/app/api/auth/[...all]/route.ts — auth catch-all route
src/middleware.ts          — protect /app routes
```

**Providers:** Email/password + Google OAuth

**Key requirements (§8.1):**
- Server-side authorization check on every resource
- All DB queries scoped by authenticated user ID
- Unauthenticated requests to `/app/*` redirect to `/login`
- Secure, expiring sessions
- Password reset flow

**Acceptance criteria:**
- User can sign up with email/password or Google
- User can log in, see session, log out
- Unauthenticated access to `/app/*` redirects to `/login`
- Password reset email sent and flow completes
- No request to any API route returns another user's data (verified via test)

---

## 1.4 AI Provider Abstraction Layer

### Task: Build provider-agnostic AI interface

**Files:**
```
src/lib/ai/
├── types.ts              — shared types for AI requests/responses
├── provider.ts           — provider interface definition
├── openai-provider.ts    — OpenAI implementation
├── index.ts              — factory: getProvider() returns active provider
└── prompts/
    ├── voice-analysis.ts — system prompts for Voice DNA analysis
    ├── post-generation.ts
    ├── hook-generation.ts
    ├── idea-generation.ts
    └── post-quality-check.ts
```

**Provider interface:**
```typescript
interface AIProvider {
  name: string;
  analyzeVoice(samples: string[], config: VoiceAnalysisConfig): Promise<VoiceAnalysisResult>;
  generatePost(params: GeneratePostParams): Promise<GeneratePostResult>;
  generateHooks(params: GenerateHookParams): Promise<GenerateHookResult[]>;
  generateIdeas(params: GenerateIdeaParams): Promise<GenerateIdeaResult[]>;
  checkQuality(content: string, voiceDna: VoiceProfile): Promise<QualityCheckResult>;
  rewriteContent(params: RewriteParams): Promise<RewriteResult>;
}

interface QualityCheckResult {
  passes: boolean;
  fabricatedClaims: boolean;
  inventedAnecdotes: boolean;
  hookRepetition: boolean;
  details: string[];
}
```

**Acceptance criteria:**
- Switching providers requires changing one env var, zero code changes
- OpenAI provider works end-to-end with test prompts
- All prompts are versioned files, not inline strings

---

## 1.5 Voice DNA Engine

### Task: Build the core Voice DNA analysis pipeline

**Files:**
```
src/lib/ai/voice-analysis.ts    — analysis orchestrator
src/lib/ai/prompts/voice-analysis.ts — system prompts
src/app/api/ai/analyze-voice/route.ts — endpoint
src/lib/voice/
├── confidence.ts         — confidence score calculator
├── versioning.ts         — version snapshot management
├── weighting.ts          — source weighting logic
└── reconciliation.ts     — slider vs AI-detected voice comparison
```

**Analysis pipeline (§8.3 + §12):**
```
WritingSample[] (with source tags)
  → Apply source weighting (linkedin_post: 1.0, blog: 0.6, other: 0.4)
  → Send to AI with structured analysis prompt
  → Parse structured JSON output
  → Compute confidenceScore:
      - Base: min(sampleCount / 10, 1.0) × 0.6
      - Consistency: agreement across samples × 0.4
  → Save VoiceProfile
  → Snapshot previous version to VoiceProfileVersion
  → Return result with confidence tier label
```

**Confidence score computation:**
```typescript
function computeConfidenceScore(sampleCount: number, consistencyScore: number): number {
  const sampleFactor = Math.min(sampleCount / 10, 1.0) * 0.6;
  const consistencyFactor = consistencyScore * 0.4;
  return Math.round((sampleFactor + consistencyFactor) * 100) / 100;
}

function confidenceTier(score: number): "Emerging" | "Solid" | "Strong" {
  if (score < 0.4) return "Emerging";
  if (score < 0.7) return "Solid";
  return "Strong";
}
```

**Slider reconciliation (§8.2):**
After AI analysis, compare user's self-reported slider positions with AI-detected voice. If delta exceeds threshold, surface in UI:
```
"You said 'Safe,' but your writing samples lean Contrarian — want to update this?"
```

**Acceptance criteria:**
- Voice analysis returns structured JSON matching VoiceProfile schema
- Confidence score computed correctly from sample count + consistency
- Versioning creates snapshot on every reanalysis
- Source weighting applied: LinkedIn-native samples weighted highest
- Slider reconciliation detects meaningful deltas between self-report and AI analysis

---

## 1.6 Writing Samples CRUD

### Task: Sample management with reanalysis trigger

**Files:**
```
src/app/api/voice/samples/route.ts       — GET (list), POST (create)
src/app/api/voice/samples/[id]/route.ts  — PATCH (update), DELETE
src/components/voice/writing-sample-form.tsx
src/components/voice/writing-sample-list.tsx
```

**Business rules (§8.3):**
- Minimum 3 samples to generate Voice DNA
- Each sample tagged by source (linkedin_post, blog, email, slack, other)
- Deleting a sample triggers reanalysis (not silently ignored)
- Samples remain individually editable/deletable at any time
- Max samples configurable per plan (free: 10, creator: 50)

**Acceptance criteria:**
- CRUD operations work for writing samples
- Deleting a sample triggers automatic Voice DNA reanalysis
- Source tag is required on creation
- Samples display with source badges in the UI
- Free tier sample cap enforced server-side

---

## 1.7 Voice DNA UI

### Task: View, edit, confirm, and manage Voice DNA

**Files:**
```
src/app/(app)/voice-dna/page.tsx          — main Voice DNA page
src/components/voice/voice-dna-display.tsx — read-only display
src/components/voice/voice-dna-editor.tsx  — manual override form
src/components/voice/voice-dna-confirm.tsx — "Does this sound like you?" modal
src/components/voice/confidence-badge.tsx  — Emerging/Solid/Strong badge
src/components/voice/sample-manager.tsx    — add/edit/delete samples
src/components/voice/slider-reconciliation.tsx — self-report vs AI delta
```

**UI (from §8.3):**
```
Your Voice DNA          [Voice DNA strength: Solid — 7 samples]

Tone: Conversational · Direct · Educational
Writing Style: Short paragraphs
Hooks: Contrarian · Storytelling
Emoji Usage: Low
CTA Style: Question

[Does this sound like you?]
  👍 Yes   👋 Somewhat   👎 No

[ Edit Preferences ] [ Add More Samples ] [ Reanalyze ]
```

**Acceptance criteria:**
- Voice DNA displays with confidence tier badge (Emerging/Solid/Strong)
- "Does this sound like you?" prompt shown after first generation
- User can manually override any dimension
- Reanalyze button triggers full reanalysis with existing samples
- Slider reconciliation popup shown when self-report ≠ AI analysis
- All changes versioned (revert available)

---

## 1.8 Voice DNA Confirmation Flow (§5.2)

### Task: Explicit satisfaction rating after generation

**Files:**
```
src/app/api/voice/rate/route.ts     — POST { rating: "yes" | "somewhat" | "no" }
src/components/voice/voice-rating-prompt.tsx
```

**Flow:**
1. User generates first post
2. Post appears with Voice DNA satisfaction prompt:
   ```
   "Does this sound like you?"
   [👍 Yes]  [👋 Somewhat]  [👎 No]
   ```
3. If "No" → show "Help us improve" with dimension overrides
4. If "Somewhat" → ask which dimension to adjust
5. If "Yes" → set `userConfirmed = true` on VoiceProfile
6. **Never gate this behind payment** (§19)

**Acceptance criteria:**
- Rating prompt shown after first generation (and optionally after subsequent ones)
- Rating saved to VoiceProfile
- `userConfirmed` flips to `true` on "Yes"
- "No" triggers improvement flow (dimension override suggestions)
- Works for free and paid users

---

## 1.9 Rejection Reason Capture (§8.4)

### Task: Lightweight rejection signal on every generation

**Files:**
```
src/app/api/generation/[id]/reject/route.ts — POST { reason }
src/components/generation/rejection-prompt.tsx
```

**Non-blocking prompt on Regenerate/discard:**
```
[Regenerating...]
Quick feedback (optional, helps us learn your voice):
[Wrong tone] [Not my experience] [Too generic] [Wrong format] [Other]
[Skip]
```

**Business rules:**
- Dismissible with one tap ("Skip")
- Single-tap reason selection (no typing required)
- Saved to `Generation.rejectionReason` and `Generation.rejectedAt`
- Feeds into Voice DNA improvement pipeline (Phase 2)
- **Never gated behind payment** (§19)

**Acceptance criteria:**
- Rejection prompt appears on regenerate/discard (non-blocking)
- Reason saved to Generation record with timestamp
- Skip option works without saving a reason
- Rejection data queryable per user for Voice DNA improvement

---

## 1.10 Background Job Infrastructure

### Task: Set up BullMQ + Redis for async processing

**Files:**
```
src/lib/queue/
├── connection.ts     — Redis connection config
├── worker.ts         — worker registry
├── jobs/
│   ├── voice-reanalysis.ts
│   ├── post-generation.ts
│   └── quality-check.ts
└── index.ts          — job dispatchers
```

**Acceptance criteria:**
- Redis connection established and testable
- Voice DNA reanalysis runs as background job
- Job failures logged with retry + exponential backoff
- Job status queryable via API

---

## Phase 1 Deliverables Summary

| Deliverable | Endpoint/Page |
|---|---|
| Auth (sign up, login, logout, password reset) | `/login`, `/signup` |
| DB schema deployed | `prisma db push` |
| Writing Samples CRUD | `GET/POST /api/voice/samples`, `PATCH/DELETE /api/voice/samples/[id]` |
| Voice DNA Analysis | `POST /api/ai/analyze-voice` |
| Voice DNA Display + Edit | `/app/voice-dna` |
| Voice DNA Confirmation | `POST /api/voice/rate`, `POST /api/voice/confirm` |
| Rejection Reason Capture | `POST /api/generation/[id]/reject` |
| Background jobs (reanalysis) | BullMQ worker |
| AI provider abstraction | `src/lib/ai/` |

---

# PHASE 2: AI Generation + Content Engine

**Goal:** Ship the core creation workflow — generate posts, hooks, and ideas using Voice DNA as a hard constraint.
**Duration estimate:** 2–3 weeks
**Deploys as:** Internal beta (functional end-to-end creation flow)

---

## 2.1 Post Generator

### Task: Generate 3 post versions from topic + Voice DNA

**Files:**
```
src/lib/ai/prompts/post-generation.ts
src/app/api/ai/generate-post/route.ts
src/components/generation/post-generator.tsx
src/components/generation/post-version-card.tsx
src/components/generation/post-editor.tsx
```

**Input fields (§8.4):**
- Topic (required)
- Goal (grow audience, build authority, generate leads, etc.)
- Format (Educational, Personal story, Contrarian, Opinion, Listicle, Framework, Case study, Lesson learned, Announcement, Promotional)
- Tone (default: "My Voice" — uses Voice DNA)
- Length (short, medium, long)
- Target audience

**Output:** Minimum 3 versions:
1. **Recommended** — best match for Voice DNA + input
2. **Different angle** — same topic, different perspective
3. **Alternative format** — different format from selected

**Generation pipeline (§14):**
```
User Input
  → Retrieve UserProfile + VoiceDNA (with confidenceScore)
  → Determine audience, format
  → Generate 3 content angles
  → Generate 3 post versions (one per angle)
  → Quality gate:
      (a) Check for fabricated statistics/claims
      (b) Check for invented personal anecdotes
      (c) Check hook repetition against user's last 10 hooks
      (d) If check fails → regenerate once server-side before returning
  → Attach metadata:
      - voiceDnaVersionUsed
      - confidenceScore at time of generation
      - model used
  → Store Generation record
  → Return 3 versions to client
```

**Output actions per version:** Edit, Regenerate, Make shorter/longer, More personal/professional/contrarian, Change hook, Save draft, Copy to clipboard.

**Hard rules (§8.4):**
- Never invent personal experiences, numbers, or anecdotes not provided by user
- Never fabricate statistics
- Never present unsupported claims as fact
- Never repeat hook structures from user's last 10 generated hooks
- Degrade gracefully with explanation when Voice DNA confidence is low

**Acceptance criteria:**
- Generates 3 versions with distinct angles/formats
- Voice DNA is visibly applied (not generic)
- Quality gate catches fabricated content (test with known-bad inputs)
- Hook novelty check prevents repetition within user's history
- Generation history is append-only (never deletes prior versions)
- Each generation stores `voiceDnaVersionUsed` for traceability
- Low-confidence Voice DNA shows visible warning ("Based on limited samples — results may feel generic until you add more.")

---

## 2.2 Hook Generator

### Task: Generate and score opening lines with voice-fit

**Files:**
```
src/lib/ai/prompts/hook-generation.ts
src/app/api/ai/generate-hooks/route.ts
src/components/generation/hook-generator.tsx
src/components/generation/hook-card.tsx
```

**Hook types:** Contrarian, Curiosity, Story, Mistake, Question, Data, Personal, Authority, All

**Hook card UI (§8.5):**
```
"Most startups don't fail because they have bad ideas."
Score: 87
Why it works: Creates curiosity and challenges a common assumption.
Voice Fit: 92 (matches your contrarian hook pattern)
[ Use ] [ Improve ] [ Copy ]
```

**Scoring (§8.5):**
- Structural score (0–100): clarity, specificity, curiosity gap, pattern-interrupt
- Voice-fit score (0–100): matches user's Voice DNA hook patterns
- **Never claim predictive performance** ("this will go viral")
- Voice-fit is a visible sub-score — a hook can score high on generic virality while scoring low on authenticity

**Acceptance criteria:**
- Generates hooks across all type categories
- Structural score computed with explainable criteria
- Voice-fit score computed against user's Voice DNA hook patterns
- No performance/virality claims
- User can improve, copy, or use a hook directly
- Hook novelty check runs against user's history

---

## 2.3 Content Ideas Engine

### Task: Personalized content ideas using all available signals

**Files:**
```
src/lib/ai/prompts/idea-generation.ts
src/app/api/ai/generate-ideas/route.ts
src/app/api/ideas/route.ts          — GET (list), PATCH (update status)
src/app/api/ideas/[id]/route.ts     — PATCH, DELETE
src/components/ideas/idea-card.tsx
src/components/ideas/idea-grid.tsx
```

**Sources (§8.6):**
- User expertise + topics + audience + goals
- Voice DNA `commonTopics`
- Previous content (avoid repetition)
- Rejection/performance history

**Idea categories:**
- Recommended for you
- Personal stories
- Educational
- Contrarian
- Trending topics
- **Content gaps** (topics in user's expertise they've never posted about — computed by cross-referencing `expertise` in UserProfile against `commonTopics` in Voice DNA)
- Repurpose opportunities

**Idea card UI (§8.6):**
```
"Why most founders are using AI wrong"
Format: Contrarian · Audience: Founders
Why suggested: Because you haven't posted about AI implementation, 
               which is in your expertise

[ Save ] [ Generate Post ] [ Hide ] [ Dismiss ] [ Add to Calendar ]
```

**Acceptance criteria:**
- Ideas generated using all signal sources
- Content gaps category shows topics in user's expertise never posted about
- Ideas cite *why* they were suggested (explainability)
- Hide/Dismiss feeds back into ranking (no resurfacing dismissed patterns)
- Ideas respect Voice DNA (contrarian ideas for contrarian voices, etc.)

---

## 2.4 Post Analyzer

### Task: Analyze existing post for quality and voice-fit

**Files:**
```
src/lib/ai/prompts/post-quality-check.ts
src/app/api/ai/analyze-post/route.ts
src/components/generation/post-analyzer.tsx
```

**Analysis dimensions:**
- Voice-fit score (how well does this match Voice DNA?)
- Hook quality
- Structure (paragraphs, sentence length)
- CTA effectiveness
- Engagement potential (structural, not predictive)
- Specificity (no generic filler)

**Acceptance criteria:**
- Returns structured analysis with scores per dimension
- Voice-fit score computed against current Voice DNA
- Provides actionable improvement suggestions
- Never claims predictive performance

---

## 2.5 Create Post Page (§10)

### Task: Unified creation experience

**Files:**
```
src/app/(app)/create/page.tsx
src/app/(app)/create/ai-post/page.tsx
src/app/(app)/create/hooks/page.tsx
src/app/(app)/create/rewrite/page.tsx
```

**Page structure:**
```
Create
├── AI Post (main generator)
├── Hooks (hook generator)
└── Rewrite (rewrite existing content)
```

**Acceptance criteria:**
- Tab/section navigation between AI Post, Hooks, Rewrite
- Post generator shows input form → 3 versions → edit → save
- All creation flows store Generation records
- Rejection prompt appears on regenerate/discard

---

## 2.6 Rewrite Tool

### Task: Rewrite existing content with Voice DNA

**Files:**
```
src/lib/ai/prompts/rewrite.ts
src/app/api/ai/rewrite/route.ts
src/components/generation/rewrite-tool.tsx
```

**Input:** Existing text + modification instructions (shorter, more personal, more contrarian, etc.)

**Acceptance criteria:**
- Preserves core message while applying Voice DNA
- Supports length, tone, and format modifications
- Shows diff/comparison between original and rewrite
- Stores as Generation record

---

## Phase 2 Deliverables Summary

| Deliverable | Endpoint/Page |
|---|---|
| Post Generator (3 versions) | `POST /api/ai/generate-post`, `/app/create/ai-post` |
| Hook Generator + scoring | `POST /api/ai/generate-hooks`, `/app/create/hooks` |
| Content Ideas | `POST /api/ai/generate-ideas`, `GET/PATCH /api/ideas` |
| Post Analyzer | `POST /api/ai/analyze-post` |
| Rewrite Tool | `POST /api/ai/rewrite`, `/app/create/rewrite` |
| Quality gate (fabrication, hook novelty) | `src/lib/ai/prompts/post-quality-check.ts` |

---

# PHASE 3: Content Management + Onboarding

**Goal:** Complete the user experience — onboarding, content library, calendar, and dashboard.
**Duration estimate:** 2 weeks
**Deploys as:** Closed beta (end-to-end user flow)

---

## 3.1 Onboarding Flow (§8.2)

### Task: 5-step onboarding with progressive profiling

**Files:**
```
src/app/(onboarding)/layout.tsx
src/app/(onboarding)/onboarding/page.tsx
src/components/onboarding/step-identity.tsx
src/components/onboarding/step-expertise.tsx
src/components/onboarding/step-audience.tsx
src/components/onboarding/step-goal.tsx
src/components/onboarding/step-voice-sliders.tsx
src/components/onboarding/progress-bar.tsx
```

**Steps (§8.2):**
1. **Identity** (required): Founder / Creator / Freelancer / Employee / Consultant / Job Seeker / Other
2. **Expertise**: AI, Startups, Technology, Marketing, Sales, Education, Leadership, Finance + custom
3. **Audience**: Founders, Developers, Recruiters, Students, Business Owners, Marketers + custom
4. **Goal**: Grow audience / Build authority / Generate leads / Find opportunities / Build personal brand / Promote a business
5. **Voice sliders**: Professional↔Casual, Educational↔Personal, Safe↔Contrarian, Simple↔Detailed

**Business rules (§8.2):**
- Every question skippable except Identity
- All data editable later from Settings
- Data versioned (store history via `OnboardingSnapshot`)
- Sliders are *defaults* — overridden by AI analysis once samples provided
- Show reconciliation when self-report ≠ AI analysis

**Post-onboarding flow:**
```
Step 5 (sliders) → Redirect to Voice DNA page → Add 3+ Writing Samples → 
Voice DNA Generated → User confirms → Dashboard
```

**Acceptance criteria:**
- 5 steps with progress indicator
- Identity step required; others skippable
- Onboarding data saved to UserProfile + OnboardingSnapshot
- After completion, user prompted to add writing samples
- All data editable in Settings later

---

## 3.2 Content Library (§8.7)

### Task: CRUD + search + filter for all content

**Files:**
```
src/app/(app)/content/page.tsx
src/app/(app)/content/drafts/page.tsx
src/app/(app)/content/ideas/page.tsx
src/components/content/content-list.tsx
src/components/content/content-card.tsx
src/components/content/content-filters.tsx
src/components/content/content-search.tsx
```

**Statuses (§8.7):** DRAFT, SAVED, APPROVED, SCHEDULED, PUBLISHED, ARCHIVED

**Capabilities:** search, filter (topic/status/format), sort, duplicate, archive, delete

**Routes (§10):**
```
/content          — all content
/content/drafts   — drafts only
/content/ideas    — saved ideas
```

**Acceptance criteria:**
- List/grid view with status badges
- Filter by topic, status, format
- Search by title/content
- Duplicate creates copy with DRAFT status
- Archive removes from active view
- Bulk actions (select multiple → archive, delete)

---

## 3.3 Content Calendar (§8.8, planning-only for MVP)

### Task: Visual calendar for content planning

**Files:**
```
src/app/(app)/calendar/page.tsx
src/components/calendar/calendar-week.tsx
src/components/calendar/calendar-month.tsx
src/components/calendar/calendar-event.tsx
src/components/calendar/drag-drop.tsx
```

**Views:** Week, Month

**Actions:**
- Drag posts onto dates
- Move posts between dates
- Create post from calendar date
- View planned content for a date

**Business rule (§8.8):** Planning-only for MVP. Auto-publish is Phase 4.

**Acceptance criteria:**
- Week and month views render correctly
- Posts draggable between dates
- Clicking empty date opens post creation
- Scheduled posts show on correct dates
- Responsive layout (week view on mobile)

---

## 3.4 Dashboard (§9)

### Task: Main hub with next actions

**Files:**
```
src/app/(app)/dashboard/page.tsx
src/components/dashboard/stats-cards.tsx
src/components/dashboard/next-idea.tsx
src/components/dashboard/voice-dna-status.tsx
src/components/dashboard/linkedin-status.tsx
```

**UI (§9):**
```
Good morning 👋

[ ✨ Create a Post ]

YOUR CONTENT
Drafts: 12   Ideas: 34   This Week: 3

NEXT RECOMMENDED IDEA
"Why most founders are using AI wrong"
[ Generate Post ]

VOICE DNA STRENGTH: Solid

LINKEDIN: (Phase 4 — shows "Connect LinkedIn" or connection status)

RECENT CONTENT
```

**Acceptance criteria:**
- Stats reflect real counts (drafts, ideas, scheduled)
- Next idea is personalized using Voice DNA + expertise
- Voice DNA strength badge shown prominently
- LinkedIn status placeholder (Phase 4 fills it in)
- Recent content shows last 5 posts with status

---

## 3.5 Navigation + Layout

### Task: App shell with sidebar navigation

**Files:**
```
src/app/(app)/layout.tsx
src/components/layout/sidebar.tsx
src/components/layout/header.tsx
```

**Navigation (§10):**
```
App
├── Dashboard
├── Create
│   ├── AI Post
│   ├── Hooks
│   └── Rewrite
├── Ideas
├── Content (Drafts / Saved / Archive)
├── Calendar
├── Voice DNA
└── Settings (Phase 5)
```

**Acceptance criteria:**
- Sidebar with all navigation items
- Active state highlighting
- Mobile-responsive (collapsible sidebar)
- User avatar + name in header

---

## Phase 3 Deliverables Summary

| Deliverable | Endpoint/Page |
|---|---|
| Onboarding (5 steps) | `/app/onboarding` |
| Content Library | `/app/content`, `/app/content/drafts`, `/app/content/ideas` |
| Content Calendar (planning) | `/app/calendar` |
| Dashboard | `/app/dashboard` |
| App shell + navigation | `/app` layout |

---

# PHASE 4: LinkedIn Integration (Conditional)

**Goal:** Connect LinkedIn, enable auto-publishing of approved content.
**Duration estimate:** 2–3 weeks (dependent on partner API access approval)
**Deploys as:** Feature flag — ships when approved, otherwise deferred to V1.1
**Note:** If partner access is not approved, Phase 4 slips. The product ships without it (Phase 3 is the minimum viable launch).

---

## 4.1 LinkedIn OAuth Connection

### Task: Connect LinkedIn account via OAuth 2.0

**Files:**
```
src/app/api/linkedin/connect/route.ts     — initiates OAuth
src/app/api/linkedin/callback/route.ts    — handles redirect
src/app/api/linkedin/disconnect/route.ts  — DELETE
src/app/api/linkedin/status/route.ts      — GET connection health
src/components/settings/linkedin-connect.tsx
```

**Flow (§8.9):**
```
Settings → Connect LinkedIn
  → OAuth consent screen (LinkedIn login)
  → Grant posting permission (w_member_social scope)
  → Token + refresh token encrypted at rest
  → Confirmation: "Connected as [Name]"
```

**Acceptance criteria:**
- OAuth flow completes successfully
- Tokens encrypted at rest (app-level encryption)
- Disconnect immediately halts auto-publishing
- Disconnect does not delete published post history
- Token expiry checked server-side, not on-demand only

---

## 4.2 Publish Schedule Management

### Task: Configure auto-publish modes and schedule

**Files:**
```
src/app/api/publish/schedule/route.ts    — GET, PATCH
src/app/api/publish/log/route.ts         — GET
src/components/settings/publish-schedule.tsx
src/components/settings/publish-queue.tsx
```

**Modes (§8.9):**

| Mode | Behavior |
|---|---|
| **Manual** (default) | Nothing auto-publishes |
| **Approved Queue** | Pre-approved drafts publish daily at chosen time |
| **Full Auto** (opt-in, off by default) | AI-generated drafts publish without per-post review (only from previously-approved patterns) |

**Acceptance criteria:**
- Mode switchable in Settings
- Manual is always default for new connections
- Full Auto requires explicit confirmation step
- Full Auto can be turned off with one click
- Queue view shows what will post and when

---

## 4.3 Auto-Publish Worker

### Task: Background job for daily publishing

**Files:**
```
src/lib/queue/jobs/auto-publish.ts
src/lib/linkedin/api.ts          — LinkedIn Share API wrapper
src/lib/linkedin/token-refresh.ts — scheduled token refresh
```

**Business rules (§8.9):**
- Max 1–2 posts/day by default
- Time-jitter to avoid platform spam detection
- If queue runs empty → skip day, notify user
- If token expires → pause auto-publish, notify user (email + in-app)
- Every auto-published post logged in PublishLog
- Publishing failures preserve draft, surface retry path

**Acceptance criteria:**
- Daily cron job checks for approved posts in queue
- Publishes next approved post at scheduled time
- Skips day if queue is empty (does not fall back to unapproved content)
- Token refresh handled automatically
- Publishing failure logged with error message
- Draft preserved on failed API call
- Rate limit: max posts/day enforced

---

## 4.4 Approval Workflow

### Task: Move posts through DRAFT → APPROVED → SCHEDULED → PUBLISHED

**Files:**
```
src/app/api/posts/[id]/approve/route.ts   — POST
src/app/api/posts/[id]/publish/route.ts   — POST (manual immediate)
src/components/content/approve-button.tsx
```

**New status: APPROVED (§12)**
- Distinct from DRAFT/SCHEDULED
- Queue state for Approved Queue mode
- Auto-publish never touches non-APPROVED content

**Acceptance criteria:**
- Approve button moves DRAFT → APPROVED
- Approve records `approvedAt` timestamp
- Full Auto mode only draws from previously-approved patterns
- Manual publish available (bypasses queue)

---

## 4.5 Safety & Failure Handling (§8.9)

### Task: Robustness for LinkedIn integration

**Checks:**
- Empty queue → skip day + notify (never publish unapproved)
- Token expired → pause + notify
- API failure → preserve draft + surface retry
- Rate limit → max 1–2 posts/day
- Time-jitter → ±15 minutes around scheduled time

**Acceptance criteria:**
- All failure modes tested with unit tests
- User notifications for: empty queue, token expiry, publish failure
- PublishLog records all attempts (success + failure)
- Pause toggle works instantly (no confirmation friction)

---

## Phase 4 Deliverables Summary

| Deliverable | Endpoint/Page |
|---|---|
| LinkedIn OAuth | `/api/linkedin/connect`, `/api/linkedin/callback` |
| Disconnect | `/api/linkedin/disconnect` |
| Connection status | `/api/linkedin/status` |
| Publish schedule | `/api/publish/schedule` |
| Publish log | `/api/publish/log` |
| Approve post | `/api/posts/[id]/approve` |
| Manual publish | `/api/posts/[id]/publish` |
| Auto-publish worker | BullMQ daily cron |
| Token refresh | Scheduled background job |

---

# PHASE 5: Polish + Launch Prep

**Goal:** Settings, data export, rate limiting, error handling, monitoring, and launch readiness.
**Duration estimate:** 1–2 weeks
**Deploys as:** Production-ready MVP

---

## 5.1 Settings Pages (§10)

### Task: Full settings management

**Files:**
```
src/app/(app)/settings/page.tsx
src/app/(app)/settings/profile/page.tsx
src/app/(app)/settings/ai-preferences/page.tsx
src/app/(app)/settings/billing/page.tsx
src/app/(app)/settings/account/page.tsx
src/app/(app)/settings/data-export/page.tsx
```

**Sections:**
- **Profile:** name, email, image, onboarding data (editable)
- **AI Preferences:** default tone, format, length, generation settings
- **Billing:** plan management, usage stats
- **Account:** change password, delete account
- **Data Export:** full export of writing samples, Voice DNA, posts, generations (§17)

**Acceptance criteria:**
- All onboarding data editable in Profile
- Onboarding data versioned (history visible)
- Data export returns portable format (JSON + CSV)
- Account deletion confirmed with typed email
- Billing integration (Stripe or equivalent)

---

## 5.2 Data Export (§17)

### Task: Full data portability

**Files:**
```
src/app/api/account/export/route.ts
src/components/settings/data-export-form.tsx
```

**Export includes:**
- Writing samples (with source tags)
- Voice DNA (all versions)
- Posts (all statuses)
- Generations (with rejection reasons)
- Onboarding data
- Publication history

**Format:** JSON (primary) + CSV for tabular data

**Acceptance criteria:**
- Export triggered on demand
- Returns all user data in portable format
- No artificial restrictions on export
- Download as ZIP with organized folders

---

## 5.3 Rate Limiting & Usage Limits

### Task: Server-side rate limiting

**Files:**
```
src/lib/rate-limit/
├── limiter.ts          — rate limit logic
├── usage-tracker.ts    — per-plan usage tracking
└── middleware.ts        — Express/Next middleware
```

**Rules (§18):**
- AI endpoints: primary cost driver, rate limit aggressively
- Per-plan usage limits enforced server-side, not just in UI
- Standard API rate limits on CRUD endpoints

**Acceptance criteria:**
- AI generation rate limited per user per plan
- Usage tracked and queryable
- Clear error messages when limit reached
- Limits enforced server-side (cannot bypass via API)

---

## 5.4 Error Handling & Reliability (§18)

### Task: Graceful degradation everywhere

**Files:**
```
src/lib/errors/
├── api-errors.ts       — typed API error classes
├── ai-errors.ts        — AI-specific error handling
└── client-errors.ts    — error boundary components
```

**Requirements (§18):**
- AI generation failures retry with backoff
- On final failure, return clear error + preserve user input
- Never make user retype a lost prompt
- All errors logged for debugging

**Acceptance criteria:**
- AI failures show specific, actionable error messages
- User input preserved on error (retry preserves prompt)
- Exponential backoff on retries
- Error boundary catches React rendering errors

---

## 5.5 Performance & Monitoring

### Task: Production readiness

**Files:**
```
src/lib/monitoring/
├── analytics.ts        — event tracking (PostHog or similar)
├── performance.ts      — Core Web Vitals
└── errors.ts           — Sentry integration
```

**Requirements (§18):**
- UI interactions fast (<200ms for non-AI)
- AI generation shows streaming/loading state
- DB queries indexed
- Error tracking in production

**Acceptance criteria:**
- Analytics events for key funnel steps (§5.2)
- Error tracking operational
- Performance monitoring for AI response times
- Database query performance verified

---

## 5.6 Copy-to-Clipboard Fallback (§16)

### Task: One-click "Copy to clipboard, open LinkedIn" flow

**Files:**
```
src/components/content/copy-to-linkedin.tsx
```

**Purpose (§16):** Fallback UX before/without LinkedIn API access. Gets user 90% of time savings without any API dependency.

**Acceptance criteria:**
- One click copies formatted post to clipboard
- Opens LinkedIn in new tab
- Works for all post formats
- Shows confirmation toast

---

## 5.7 Landing Page + Pricing (§19)

### Task: Public-facing pages

**Files:**
```
src/app/page.tsx          — landing
src/app/pricing/page.tsx  — pricing
src/components/landing/hero.tsx
src/components/landing/features.tsx
src/components/landing/cta.tsx
src/components/pricing/pricing-card.tsx
```

**Pricing (§19):**
- **Free:** limited AI generations, basic Voice DNA, limited ideas, draft storage
- **Creator:** higher AI limits, advanced Voice DNA (multi-source weighting, higher sample cap), unlimited drafts, calendar, more ideas, advanced rewriting

**Critical rule (§19):** Do not price-gate:
- "Does this sound like me?" confirmation loop
- Rejection-reason capture
- These are learning signals the product needs from every user

**Acceptance criteria:**
- Landing page communicates value proposition clearly
- Pricing page shows plan comparison
- Signup flow starts from pricing CTA
- Free tier includes feedback loops (no paywall on learning signals)

---

## 5.8 Copy/Paste Workflow (§16)

### Task: Robust non-API publishing path

**Files:**
```
src/components/content/copy-and-publish.tsx
```

**Flow:**
1. User edits/saves post in Content Library
2. "Publish to LinkedIn" button
3. If LinkedIn not connected → show copy-to-clipboard + open LinkedIn
4. If LinkedIn connected → show publish confirmation with preview
5. Success/failure toast

**Acceptance criteria:**
- Works without LinkedIn connection (copy path)
- Works with LinkedIn connection (API path)
- Post formatted correctly for LinkedIn (line breaks, hashtags, etc.)
- Published status updated on success

---

## Phase 5 Deliverables Summary

| Deliverable | Endpoint/Page |
|---|---|
| Settings (all sections) | `/app/settings/*` |
| Data Export | `/api/account/export`, `/app/settings/data-export` |
| Rate Limiting | Server-side middleware |
| Error Handling | Error boundaries + typed errors |
| Monitoring | Analytics + error tracking |
| Copy-to-Clipboard | Component |
| Landing + Pricing | `/`, `/pricing` |
| Copy/Publish workflow | Component |

---

# CROSS-CUTTING CONCERNS

## A. Anti-Convergence Check (§15.1)

**Implementation:** Periodic job that samples outputs across users and checks for homogenization.

```
Files:
src/lib/ai/convergence-check.ts
src/lib/queue/jobs/convergence-check.ts
```

**Logic:**
- Sample N outputs per hook type across random users
- Compute embedding similarity between outputs
- If average similarity exceeds threshold → flag as P0 quality bug
- Alert team, pause affected generation template

**Acceptance criteria:**
- Runs weekly as background job
- Detects homogenization across users
- Alerts when threshold exceeded
- Logs convergence metrics for analysis

---

## B. Content Policy Constraints (§15.2)

**Implementation:** Explicit content policy on generation pipeline.

```
Files:
src/lib/ai/content-policy.ts
```

**Rules:**
- No manipulative curiosity gaps
- No fear-based hooks
- No engagement-bait patterns
- No fake vulnerability framing
- No misleading "controversial take" framing not backed by genuine opinion

**Acceptance criteria:**
- Content policy enforced in generation prompts
- Policy violations caught in quality gate
- Policy versioned and updatable without code changes

---

## C. Transparency Layer (§15.3)

**Implementation:** Show user *why* the AI made each choice.

```
Files:
src/components/generation/ai-explanation.tsx
```

**Shows:**
- Which Voice DNA trait drove a tone decision
- Why a particular hook pattern was selected
- Why format was recommended
- Why content gap was surfaced

**Acceptance criteria:**
- Every generation includes explanation metadata
- Explanations visible in UI (expandable)
- User stays the editor, not a rubber stamp

---

## D. Test Strategy

**Unit tests:** Voice DNA confidence scoring, source weighting, quality gate logic, rate limiting
**Integration tests:** Full generation pipeline, Voice DNA analysis → generation → rejection → reanalysis loop
**E2E tests (Playwright):** Onboarding → Voice DNA → generate → edit → save → calendar

```
Tests should cover:
- Voice DNA confidence computation
- Source weighting accuracy
- Quality gate catches fabricated content
- Hook novelty check prevents repetition
- Rejection reason saved correctly
- Generation history append-only
- LinkedIn OAuth flow (mock)
- Auto-publish worker logic
- Rate limiting enforcement
- Data export completeness
```

---

## E. Seed Data & Development Environment

```
prisma/seed.ts
├── Create test user with complete profile
├── Generate 10 writing samples (varied sources)
├── Create Voice DNA with confidence score 0.8
├── Generate sample posts, ideas, generations
└── Set up LinkedIn mock connection (for dev)
```

---

# PHASE DEPENDENCIES & CRITICAL PATH

```
Phase 1 (Foundation + Voice DNA)
  ↓
Phase 2 (AI Generation)  ← depends on Voice DNA engine from Phase 1
  ↓
Phase 3 (Content Mgmt + Onboarding)  ← depends on Generation from Phase 2
  ↓
Phase 4 (LinkedIn Integration)  ← independent of Phase 3, can parallelize
  ↓
Phase 5 (Polish + Launch)  ← depends on all prior phases
```

**Critical path items (cannot slip):**
1. Voice DNA confidence scoring (§8.3) — retention thesis depends on this
2. Rejection reason capture (§8.4) — learning loop depends on this
3. Provider-agnostic AI interface (§11) — model swap flexibility
4. Generation traceability (`voiceDnaVersionUsed`) — validates moat thesis
5. Quality gate in generation pipeline (§14) — prevents fabrication

**Can slip without blocking launch:**
1. LinkedIn integration (Phase 4) — V1.1 fallback
2. Full Auto mode — Approved Queue + Manual are sufficient
3. Advanced rewrite options — basic rewrite ships, refinements later
4. Post Analyzer — useful but not in MVP success definition (§21)

---

# MVP SUCCESS DEFINITION CHECKLIST (§21)

The MVP succeeds if a user can complete:

```
□ Sign Up (email/password or Google OAuth)
□ Complete Profile (5-step onboarding)
□ Paste 3+ Writing Samples
□ Voice DNA Generated AND Confirmed "sounds like me"
□ Enter Idea
□ Generate 3 Personalized Posts (with Voice DNA applied)
□ Select One
□ Edit (not just blind-accept)
□ Save Draft
□ Add to Calendar
```

**Core product question to validate:**
> Does a user trust the AI's output enough to publish it with only light edits, and does that trust increase (not plateau) by their 10th generation?

**Instrumentation for this question:**
- Track edit ratio per generation (edit length / total length)
- Track rejection rate over time (should decrease)
- Track Voice DNA confirmation stability (should not flip to "No" after initial "Yes")
- Track time from generation to publish (should decrease)

---

# ESTIMATED TOTAL TIMELINE

| Phase | Duration | Cumulative |
|---|---|---|
| Phase 1: Foundation + Voice DNA | 3–4 weeks | Week 4 |
| Phase 2: AI Generation + Content Engine | 2–3 weeks | Week 7 |
| Phase 3: Content Management + Onboarding | 2 weeks | Week 9 |
| Phase 4: LinkedIn Integration (if approved) | 2–3 weeks | Week 12 |
| Phase 5: Polish + Launch Prep | 1–2 weeks | Week 14 |

**MVP launch (without LinkedIn):** ~9 weeks
**Full launch (with LinkedIn):** ~14 weeks

---

*This plan is designed to be executed sequentially within phases, with Phase 4 (LinkedIn) potentially parallelizing with Phase 3 if resources allow. Each phase is independently deployable and testable.*
