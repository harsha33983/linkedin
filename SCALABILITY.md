# SCALABILITY.md

Post-upgrade architecture for the AI post-generation stack.

## 1. Architecture

```
USER INPUT (+ optional facts: whatHappened / whatLearned / result)
      │
      ▼
buildPostGenerationContext()      — DNA profile, REAL LinkedIn metrics,
      │                             anti-repetition corpus, trends, pillars
      ▼
buildStyleContext()               — structure engine + humanizer block
      │                             + RAG style examples + learned adjustments
      ▼
LLM ROUTER (src/lib/ai/llm-router.ts)
      │   classifyTask() → LOW | MEDIUM | HIGH
      │   LOW      → deterministic path (zero LLM cost)
      │   MEDIUM   → cheap provider first (OpenRouter), bounded retry
      │   HIGH     → primary (Groq) with retry + backoff
      │
      │   resilience: withRetry (max 2 retries, 1s→2s backoff, 429/timeout only,
      │   auth + ECONNREFUSED fail fast) → circuit breaker per provider
      │   (4 consecutive failures → open 60s → half-open probe)
      │   → next provider → deterministic local NLP generator (never fails)
      ▼
QUALITY ENGINE (deterministic, zero LLM cost)
      │   AI-pattern risk, specificity, originality, clarity, readability
      │   all-fail → exactly ONE corrective regeneration (MAX_REGENERATIONS=1)
      ▼
DRAFT → USER EDIT → edit-learning API → style_adjustments + writing_examples
      │
      ▼
generation_logs + generation_usage (provider, latency, tokens, cost)
      → feeds style_context on every future generation (learning loop)
```

Groq is one provider behind the abstraction (`provider-registry.ts`), not the
center. The frontend only sees `metadata.model` — it never knows routing
details, keys, or fallback decisions.

## 2. LLM routing strategy

| Task type | Complexity | Route |
|---|---|---|
| HASHTAGS, FORMAT, SUMMARIZATION | LOW | deterministic code, never an LLM |
| HOOK_GENERATION, IDEA_GENERATION, REWRITE | MEDIUM | cheap provider → primary → local |
| POST_GENERATION, STORYTELLING, STYLE_ANALYSIS | HIGH | primary (Groq) → secondary → local |

Provider order resolves in `provider-order.ts`. The dead `kimi` default is
guarded (no key → never primary), eliminating one wasted failing call per
generation that existed pre-upgrade.

## 3. Groq rate-limit strategy

- 429/timeout → exponential backoff 1s → 2s, max 2 retries per provider.
- Auth errors, ECONNREFUSED, ENOTFOUND → no retry (fail fast to fallback).
- Circuit breaker: 4 consecutive failures open the circuit for 60s; requests
  during the open window skip the provider entirely; a half-open probe closes
  it on success.
- After all providers: local NLP generator — the UX never dead-ends.
- Everything is bounded; there are no infinite retry loops.

## 4. Caching

- `writing_examples` (keyword-indexed) — retrieval is a single indexed query
  per generation; examples are deduped on store (LEFT 200 match).
- `style_adjustments` — learned preferences read once per generation.
- Style analysis is derived, not re-derived: the NLP profile is stored on the
  voice profile and reused.
- Personalized post bodies are NEVER cached across users (correct by design —
  each generation is user-specific).

## 5. Queue architecture

Current state (honest): generation is synchronous streaming — the UX renders
tokens as they arrive, so a queue adds latency without benefit at this scale.
`src/lib/queue/index.ts` dispatchers are in-process mocks; voice reanalysis
runs fire-and-forget in-process. The job-monitor (/api/admin/jobs) covers the
publish pipeline, which is DB-backed and lock-safe.

When to introduce BullMQ for generation: multi-instance deployments, batch
generation features, or worker-based providers (headless browsers). The router
and logging layers are already queue-agnostic — a worker would call the same
`routeGenerate()`.

## 6. Database

Additive migration (`migrations-ai-upgrade.sql`, applied and verified):

- `writing_examples(userId, content, source, keywords[])` — style RAG corpus
- `generation_logs(userId, requestType, provider, model, promptName,
  promptVersion, taskComplexity, tokens, latencyMs, status, errorCode,
  retries, estimatedCostUsd)` — observability + cost
- `generation_usage(userId, date, requests, tokens, cost)` UNIQUE(userId,date)
- `style_adjustments(userId, dimension, adjustment, strength, samples)
  UNIQUE(userId,dimension,adjustment)` — edit learning
- `prompts(name, version, model, temperature, active) UNIQUE(name,version)` —
  prompt registry (seeded: linkedin_post_stream v2, ai_pattern_check v1)

Indexes on userId/time for all hot queries. No existing table or column was
altered; no destructive change.

## 7. Deployment

- Apply `migrations-ai-upgrade.sql` (idempotent) before/with deploy.
- Env: existing keys only (`GROQ_API_KEY`, `OPENROUTER_API_KEY` optional,
  `AI_PROVIDER` recommended `groq`). No new required secrets.
- `npm run build && npm start`; scraper service unchanged.

## 8. Monitoring

- `GET /api/admin/ai-health` (authenticated): in-process provider health
  (requests, 429s, failures, latency, tokens, cost, circuit state), 24h
  generation_logs aggregates, per-provider breakdown, 7-day usage.
- Key metrics to alert on: success rate < 90%, 429 rate > 15%, fallback rate
  > 20% (means providers are degraded), avg latency > 30s.

## 9. Future scaling

1. BullMQ worker + job-status endpoints for async generation (seam exists).
2. pgvector embeddings for writing examples when keyword scoring becomes the
   bottleneck (schema has a clean source field to backfill from).
3. Prompt A/B: registry rows exist; generation_logs already records
   promptVersion — add prompt_id resolution and split analysis.
4. Redis-backed provider health shared across instances (today: per-process).
5. Cost guardrails: usage rows enable per-subscription daily caps.
