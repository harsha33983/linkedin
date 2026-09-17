# ARCHITECTURE_AUDIT.md

Pre-upgrade audit of the AI post-generation stack. Written before any code changes (STEP 1).

## 1. Current architecture

```
Next.js 14 App Router (port 3001)
├── src/app/api/…            — Route Handlers ARE the backend (no Express/Nest)
├── src/lib/ai/              — AI layer
│   ├── types.ts             — AIProvider interface + getProvider()/withFailover()
│   ├── groq-provider.ts     — GroqProvider (primary in practice)
│   ├── kimi-provider.ts     — KimiProvider (default AI_PROVIDER, key returns 403)
│   ├── openai-provider.ts   — OpenAIProvider (no key configured)
│   ├── openrouter-provider.ts — OpenRouterProvider (secondary)
│   ├── local-generator.ts   — Tier-3 rule-based generator (NLP templates, no LLM)
│   ├── chat-json.ts         — raw JSON chat w/ provider failover (originality pipeline)
│   ├── post-generation-context.ts — shared context builder (DNA, metrics, anti-repetition)
│   └── prompts/             — hardcoded prompt builder functions
├── src/lib/voice/           — Voice DNA: NLP analyzer, versioning, weighting, import
├── src/lib/dna/             — Full DNA profile (Voice × Performance × Audience × Trend)
├── src/lib/rate-limit/redis-limiter.ts — Redis fixed-window limiter (in-memory fallback)
├── src/lib/queue/index.ts   — MOCK dispatchers only (BullMQ listed but unused)
└── scraper-service/         — separate Python Scrapling service (viral posts)
```

## 2. Generation flow (as found)

```
Browser: /create/ai-post
  → POST /api/ai/generate-post/stream   (falls back to /api/ai/generate-post)
     → requireAuthFromRequest → Zod validate → Redis rate limit (20/h)
     → buildPostGenerationContext(): DNA profile, real LinkedIn metrics,
       recent drafts (anti-repetition), trending topics, content pillars
     → Tier 1: AI_PROVIDER (default kimi → 403) → Tier 2: Groq/OpenRouter
       → Tier 3: local NLP generator (never fully fails)
     → advisory LLM quality check (buffered route only)
     → INSERT INTO generations …
  → UI renders 3 version cards → user edits (overrides PUT /api/generation/latest)
  → Save draft → POST /api/posts
```

## 3. Current Groq usage

- `GROQ_API_KEY` present; `AI_MODEL=openai/gpt-oss-120b` via chat.completions (SDK).
- Groq is the *de facto* engine: the configured default provider (kimi) 403s, so
  every generation burns a failed call then falls back to Groq.
- **No retry/backoff on 429**, **no timeout**, **no circuit breaker**, **no
  concurrency limit**. A 429 from Groq immediately degrades to the local
  template generator (visible quality cliff) or OpenRouter if configured.
- No token/cost accounting anywhere; `model` is stored but latency/tokens are not.

## 4. Database (Neon Postgres via @neondatabase/serverless)

Existing and reused: `user`, `user_profiles`, `posts` (incl. `overrides` on
`generations`), `generations`, `writing_samples`, `voice_dna_versions`,
`performance_signals`, `content_ideas`, `social_accounts`, `scraper_cache`,
`viral_posts`. **No pgvector** (plain Postgres). No generation_logs, no prompt
registry, no style-adjustment store.

## 5. API routes (AI-relevant)

- POST /api/ai/generate-post (+ /stream) — full pipeline above
- POST /api/ai/generate-hooks, /generate-ideas, /rewrite, /analyze-post, /generate-image
- /api/generation/latest (GET/PUT overrides), /api/generation/[id]/reject
- /api/posts, /api/posts/[id] (PATCH used for scheduling)
- /api/voice/* — samples, LinkedIn import, analysis

## 6. Frontend flow

`src/app/(app)/create/ai-post/page.tsx` (1067 lines, client): form (topic,
audience, goal, format, length, tone) → streaming NDJSON consumption → 3 cards
→ inline edit (persistOverrides) → save draft / schedule / reject.

## 7. Problems (ranked)

1. **P0 — No resilience on Groq 429s**: single-shot call, then quality cliff.
2. **P0 — Dead default provider**: `AI_PROVIDER=kimi` 403s on every request
   (wasted latency + confusing failover logs).
3. **P1 — Groq is a hard center**: no task classification; even trivial work is
   LLM-shaped; no cost awareness.
4. **P1 — No deterministic quality engine**: quality check is an *extra LLM
   call* (cost + latency + non-determinism), advisory only, never shapes output.
5. **P1 — Edit learning missing**: user edits are stored (`overrides`) but never
   analyzed → the system never improves from the strongest available signal.
6. **P2 — No prompt versioning, no generation logs** (latency/tokens/cost), no
   A/B basis.
7. **P2 — No structure engine**: the LLM invents post architecture per call.
8. **P2 — Queue is a mock**; acceptable today (single instance, streaming UX)
   but must be documented honestly.
9. **P3 — No tests, no test runner.**
10. **P3 — No RAG over writing examples** (all samples are stuffed into every
    prompt or ignored).

## 8. What already works well (keep)

- `AIProvider` interface + `withFailover()` — correct seam for a router.
- Local NLP generator — the right "no-LLM" tier; keep and route to it.
- Voice DNA stack (NLP analyzer is genuinely deep) — reuse as the style profile.
- Deterministic hashtags (zero-LLM) — proves the no-LLM task pattern.
- Real-metrics-only policy and anti-fabrication stance in prompts.

## 9. Proposed target architecture

```
CONTENT INPUT (+ facts: what happened / learned / result)
      │
      ▼
buildPostGenerationContext()  (existing — DNA, real metrics, anti-repetition)
      │                        + NEW: RAG example retrieval (keyword overlap)
      ▼
POST STRUCTURE ENGINE (NEW — 13 structures, chosen deterministically)
      │
      ▼
LLM ROUTER (NEW) ── classify TASK_TYPE + complexity
      │                ├─ TEMPLATE/DETERMINISTIC → code (structure filler, hashtags)
      │                ├─ LOW → cheap/secondary model
      │                └─ HIGH → Groq (primary) w/ resilience:
      │                     retry + exponential backoff on 429/timeout (max 2)
      │                     circuit breaker per provider
      │                     provider failover (existing withFailover)
      │                     final fallback: local NLP generator
      ▼
HUMANIZER CONSTRAINTS (NEW prompt section — banned openers, formatting rules,
│                     user facts injected, learned style adjustments)
▼
QUALITY ENGINE (NEW — deterministic AI-pattern detector; regenerates ONCE max)
      │
      ▼
DRAFT → USER EDIT → EDIT LEARNING (NEW — diff → style adjustments table)
      │                  → feeds back into the prompt on next generation
      ▼
GENERATION LOGS (NEW — provider, model, promptVersion, latency, tokens, cost)
```

## 10. Constraints honored

- No new backend framework; Route Handlers stay the API layer.
- No destructive schema changes; additive migrations only.
- Existing UX (streaming, 3 cards, edits) preserved.
- Groq demoted to "one provider inside the abstraction" — the router decides.
