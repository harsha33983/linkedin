-- =====================================================================
-- AI Architecture Upgrade — additive migration (no destructive changes)
-- Postgres / Neon. Idempotent: safe to run twice.
--   npx tsx .freebuff/apply-ai-migration.ts
-- =====================================================================

-- 1. Writing examples (style RAG source)
CREATE TABLE IF NOT EXISTS "writing_examples" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'USER_POST',          -- USER_POST | UPLOADED_EXAMPLE | FINAL_EDIT | IMPORTED_CONTENT
  "keywords" TEXT[] NOT NULL DEFAULT '{}',             -- extracted top terms for retrieval
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "writing_examples_userId_idx" ON "writing_examples"("userId");
CREATE INDEX IF NOT EXISTS "writing_examples_source_idx" ON "writing_examples"("userId", "source");

-- 2. Structured generation logs (provider health, latency, tokens, cost)
CREATE TABLE IF NOT EXISTS "generation_logs" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "requestType" TEXT NOT NULL,             -- POST_GENERATION | HOOKS | IDEAS | REWRITE | QUALITY_CHECK | ...
  "provider" TEXT,                         -- groq | openrouter | local-nlp | template
  "model" TEXT,
  "promptName" TEXT,                       -- e.g. linkedin_post_stream
  "promptVersion" TEXT,                    -- e.g. v2
  "taskComplexity" TEXT,                   -- LOW | MEDIUM | HIGH
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "latencyMs" INTEGER,
  "status" TEXT NOT NULL,                  -- success | error | fallback
  "errorCode" TEXT,                        -- LLM_RATE_LIMITED | TIMEOUT | PROVIDER_ERROR | ...
  "retries" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "generation_logs_user_idx" ON "generation_logs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "generation_logs_provider_idx" ON "generation_logs"("provider", "createdAt");

-- 3. Prompt registry (versioning + future A/B)
CREATE TABLE IF NOT EXISTS "prompts" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,                    -- e.g. linkedin_post_stream
  "version" TEXT NOT NULL,                 -- e.g. v1, v2
  "description" TEXT,
  "model" TEXT,
  "temperature" DOUBLE PRECISION,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("name", "version")
);

-- 4. Per-user daily usage (cost control; limits stay in subscription config)
CREATE TABLE IF NOT EXISTS "generation_usage" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "requests" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE("userId", "date")
);

-- 5. Learned style adjustments from user edits (edit learning)
CREATE TABLE IF NOT EXISTS "style_adjustments" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "dimension" TEXT NOT NULL,               -- opener | sentenceLength | emoji | hashtag | formatting | cta | vocabulary | tone
  "adjustment" TEXT NOT NULL,              -- machine-readable learned preference
  "strength" DOUBLE PRECISION NOT NULL DEFAULT 1.0,  -- aggregate evidence; grows with confirmations
  "samples" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId", "dimension", "adjustment")
);
CREATE INDEX IF NOT EXISTS "style_adjustments_user_idx" ON "style_adjustments"("userId", "dimension");

-- Seed the prompt registry with what ships in this upgrade (ON CONFLICT keeps it idempotent)
INSERT INTO "prompts" ("id", "name", "version", "description", "model", "temperature", "active")
VALUES
  (gen_random_uuid()::text, 'linkedin_post_stream', 'v2', 'Structure-aware human-writing generation with banned-openers list and user facts', 'auto', 0.7, true),
  (gen_random_uuid()::text, 'ai_pattern_check', 'v1', 'Deterministic (non-LLM) AI-pattern detection metadata row', null, null, true)
ON CONFLICT ("name", "version") DO NOTHING;
