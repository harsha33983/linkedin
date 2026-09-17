/**
 * AI architecture upgrade — unit tests (zero-dependency, run with tsx).
 *
 *   npx tsx tests/ai-upgrade.test.ts
 *
 * Covers: task classification, circuit breaker, retry/backoff policy,
 * provider ordering, structure selection, AI-pattern detection, edit-learning
 * diff signals, keyword extraction, and usage recording.
 */

// Minimal harness
let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((err: any) => {
      failed++;
      failures.push(`${name}: ${err?.message || err}`);
      console.log(`  ✗ ${name}: ${String(err?.message || err).slice(0, 160)}`);
    });
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertClose(actual: number, expected: number, tol: number, msg: string) {
  if (Math.abs(actual - expected) > tol) throw new Error(`${msg} (got ${actual}, want ~${expected})`);
}

// Isolate module state (circuit breaker health map) per import
async function freshRouter() {
  return import("../src/lib/ai/llm-router");
}

// ── 1. Task classification ────────────────────────────────────

async function testClassification() {
  const m = await freshRouter();
  await test("classifyTask: HASHTAGS is LOW (never an LLM)", () => {
    assert(m.classifyTask("HASHTAGS") === "LOW", "hashtags must be LOW");
  });
  await test("classifyTask: POST_GENERATION is HIGH", () => {
    assert(m.classifyTask("POST_GENERATION") === "HIGH", "post gen must be HIGH");
  });
  await test("classifyTask: REWRITE is MEDIUM", () => {
    assert(m.classifyTask("REWRITE") === "MEDIUM", "rewrite must be MEDIUM");
  });
}

// ── 2. Retry / backoff policy ─────────────────────────────────

async function testRetry() {
  const m = await freshRouter();
  await test("withRetry: succeeds without retry on first pass", async () => {
    let calls = 0;
    const { result, retries } = await m.withRetry(async () => { calls++; return "ok"; });
    assert(result === "ok" && calls === 1 && retries === 0, "should not retry");
  });

  await test("withRetry: retries on 429 then succeeds (bounded)", async () => {
    let calls = 0;
    const { retries } = await m.withRetry(
      async () => {
        calls++;
        if (calls < 3) { const e: any = new Error("rate limit exceeded"); e.status = 429; throw e; }
        return "ok";
      },
      { baseDelayMs: 1 }
    );
    assert(calls === 3 && retries === 2, `expected 3 calls / 2 retries, got ${calls}/${retries}`);
  });

  await test("withRetry: gives up after maxRetries (no infinite loop)", async () => {
    let calls = 0;
    try {
      await m.withRetry(
        async () => { calls++; const e: any = new Error("429 too many requests"); throw e; },
        { maxRetries: 2, baseDelayMs: 1 }
      );
      assert(false, "should have thrown");
    } catch {
      assert(calls === 3, `max 3 attempts expected, got ${calls}`);
    }
  });

  await test("withRetry: does NOT retry auth errors (fail fast)", async () => {
    let calls = 0;
    try {
      await m.withRetry(
        async () => { calls++; const e: any = new Error("401 unauthorized"); e.status = 401; throw e; },
        { maxRetries: 3, baseDelayMs: 1 }
      );
      assert(false, "should have thrown");
    } catch {
      assert(calls === 1, `auth errors must not retry, got ${calls} calls`);
    }
  });

  await test("withRetry: does NOT retry hard provider errors", async () => {
    let calls = 0;
    try {
      await m.withRetry(async () => { calls++; throw new Error("ECONNREFUSED not a timeout"); }, { maxRetries: 2 });
      assert(false, "should have thrown");
    } catch {
      assert(calls === 1, `hard errors must not retry, got ${calls} calls`);
    }
  });
}

// ── 3. Circuit breaker ────────────────────────────────────────

async function testCircuitBreaker() {
  const m = await freshRouter();
  const name = `test-breaker-${Date.now()}`;

  await test("circuit: opens after consecutive failures", () => {
    for (let i = 0; i < 4; i++) (m as any).recordFailure(name, "error", 10);
    assert(m.circuitAllows(name) === false, "circuit should be open");
  });

  await test("circuit: half-opens after cooldown", async () => {
    // Age the open timestamp past the cooldown
    const h = (m as any).getHealth(name);
    h.openedAt = Date.now() - 61_000;
    assert(m.circuitAllows(name) === true, "circuit should half-open after cooldown");
  });

  await test("circuit: success closes it again", () => {
    // The breaker had already accrued 4 failures × 10ms; a success at 50ms
    // closes the circuit and resets the failure streak.
    (m as any).recordSuccess(name, 50);
    const h = (m as any).getHealth(name);
    assert(h.opened === false && h.consecutiveFailures === 0, "success should reset breaker");
  });

  await test("health snapshot: counts and latency tracked", () => {
    const snap = m.providerHealthSnapshot();
    const s = snap[name];
    assert(s && s.requestCount === 5 && s.successCount === 1, `snapshot wrong: ${JSON.stringify(s)}`);
    // avg latency = (4×10 + 50) / 1 success = 90
    assert(s.avgLatencyMs === 90, `latency average wrong: got ${s?.avgLatencyMs}`);
  });
}

// ── 4. Provider ordering ──────────────────────────────────────

async function testProviderOrder() {
  const po = await import("../src/lib/ai/provider-order");
  const saved = { provider: process.env.AI_PROVIDER, openrouter: process.env.OPENROUTER_API_KEY, kimi: process.env.KIMI_API_KEY };

  await test("provider order: dead kimi default is guarded to groq", () => {
    process.env.AI_PROVIDER = "kimi";
    delete process.env.KIMI_API_KEY;
    assert(po.getPrimaryProviderName() === "groq", "kimi without key must not be primary");
  });

  await test("provider order: HIGH tries primary then secondary", () => {
    process.env.AI_PROVIDER = "groq";
    process.env.OPENROUTER_API_KEY = "test-key";
    const order = po.getProviderOrder("HIGH");
    assert(order[0] === "groq" && order[1] === "openrouter", `order wrong: ${order}`);
  });

  await test("provider order: MEDIUM prefers cheap secondary first", () => {
    process.env.AI_PROVIDER = "groq";
    process.env.OPENROUTER_API_KEY = "test-key";
    const order = po.getProviderOrder("MEDIUM");
    assert(order[0] === "openrouter" && order[1] === "groq", `medium order wrong: ${order}`);
  });

  await test("provider order: MEDIUM skips secondary without a key", () => {
    process.env.AI_PROVIDER = "groq";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const order = po.getProviderOrder("MEDIUM");
    assert(order.length === 1 && order[0] === "groq", `order wrong: ${order}`);
  });

  Object.assign(process.env, { AI_PROVIDER: saved.provider, OPENROUTER_API_KEY: saved.openrouter, KIMI_API_KEY: saved.kimi });
}

// ── 5. Router end-to-end (mock ops) ───────────────────────────

async function testRouterE2E() {
  const m = await freshRouter();
  const po = await import("../src/lib/ai/provider-order");
  process.env.AI_PROVIDER = "groq";
  delete process.env.OPENROUTER_API_KEY;

  await test("router: primary success path returns provider + no fallback", async () => {
    // routeGenerate's circuit may be open from other tests — use unique op
    const r = await m.routeGenerate({
      taskType: "REWRITE",
      op: async (p: string) => ({ text: `from-${p}` }),
      fallback: async () => ({ text: "local" }),
    });
    assert(r.result.text === "from-groq" && r.provider === "groq" && r.fallbackUsed === false, JSON.stringify(r));
  });

  await test("router: falls back to local when every provider fails", async () => {
    // Force circuit open for the primary so the failure path is instant
    const order = po.getProviderOrder("MEDIUM");
    for (const p of order) {
      const h = (m as any).getHealth(p);
      h.consecutiveFailures = 99; h.opened = true; h.openedAt = Date.now();
    }
    const r = await m.routeGenerate({
      taskType: "REWRITE",
      op: async () => { throw new Error("provider down"); },
      fallback: async () => ({ text: "local-nlp" }),
    });
    assert(r.fallbackUsed === true && r.result.text === "local-nlp", JSON.stringify(r));
  });

  await test("router: LOW complexity never calls an LLM", async () => {
    let llmCalled = false;
    const r = await m.routeGenerate({
      taskType: "HASHTAGS",
      op: async () => { llmCalled = true; return {}; },
      fallback: async () => ({ tags: ["#AI"] }),
    });
    assert(llmCalled === false && r.provider === "local", "LOW must use deterministic path");
  });
}

// ── 6. Structure engine ───────────────────────────────────────

async function testStructure() {
  const ps = await import("../src/lib/ai/post-structure");

  await test("structure: explicit format wins", () => {
    const s = ps.selectStructure({ format: "Listicle", topic: "anything" });
    assert(s.id === "LIST", `got ${s.id}`);
  });

  await test("structure: facts drive selection", () => {
    const s = ps.selectStructure({ topic: "x", hasFacts: { whatHappened: true, whatLearned: true } });
    assert(s.id === "FAILURE_LESSON", `got ${s.id}`);
    const s2 = ps.selectStructure({ topic: "x", hasFacts: { result: true } });
    assert(s2.id === "CASE_STUDY", `got ${s2.id}`);
  });

  await test("structure: topic signals apply when no facts/format", () => {
    const s = ps.selectStructure({ topic: "5 mistakes every founder makes" });
    assert(s.id === "LIST", `got ${s.id}`);
  });

  await test("structure: safe default is LEARNING", () => {
    const s = ps.selectStructure({ topic: "zebra quantum pants" });
    assert(s.id === "LEARNING", `got ${s.id}`);
  });

  await test("structure: all 13 structures exist with sections", () => {
    assert(ps.POST_STRUCTURES.length === 13, `expected 13, got ${ps.POST_STRUCTURES.length}`);
    for (const s of ps.POST_STRUCTURES) {
      assert(s.sections.length >= 3, `${s.id} needs sections`);
      assert(s.formats.length >= 1 && s.signals.length >= 1, `${s.id} needs formats+signals`);
    }
  });

  await test("structure: every section has a prompt guide (no undefined)", () => {
    // Build prompt for a couple of structures and assert no 'undefined' leaks
    for (const s of [ps.byId("STORY"), ps.byId("QUESTION"), ps.byId("TUTORIAL")]) {
      const block = ps.formatStructureForPrompt(s, { whatHappened: "x happened" });
      assert(!block.includes("undefined"), `${s.id} prompt contains undefined`);
    }
  });
}

// ── 7. AI-pattern detector (quality engine) ───────────────────

async function testQuality() {
  const q = await import("../src/lib/ai/content-quality");

  await test("quality: generic AI slop fails the gate", () => {
    const slop = `In today's fast-paced world, AI is a game changer. 🚀🔥✨💡⚡🎯

Let's dive in. AI is transforming everything. AI is transforming industries. AI is transforming the future.

Studies show that 73% of people believe AI will change their lives. The possibilities are endless.

What are you waiting for? 🚀🚀

#AI #FutureOfWork #Innovation #Tech #GameChanger #Disruption`;
    const r = q.analyzeContentQuality(slop);
    assert(!r.passes, `slop should fail: ${JSON.stringify(r)}`);
    assert(r.aiPatternRisk > 45, `risk should be high: ${r.aiPatternRisk}`);
    assert(r.flags.length >= 3, `flags expected, got ${r.flags.length}`);
  });

  await test("quality: specific human post passes", () => {
    const human = `Our deploy broke at 6pm on a Friday. Of course it did.

The culprit: a single untyped env var. MISSING_API_KEY silently coerced to "undefined" and every webhook died.

We fixed it in 20 minutes, but spent 3 hours adding guardrails:
- startup-time validation for all 14 env vars
- a dead-letter queue for failed webhooks
- an alert that fires before users notice

Error rate went from 14% to under 1% by Monday. Was it worth the weekend? Ask me never.`;
    const r = q.analyzeContentQuality(human);
    assert(r.specificity > 60, `specificity low: ${r.specificity}`);
    assert(r.passes, `human post should pass: ${JSON.stringify(r)}`);
  });

  await test("quality: empty content fails safely", () => {
    const r = q.analyzeContentQuality("");
    assert(!r.passes && r.aiPatternRisk === 100, "empty must fail");
  });

  await test("quality: user facts boost specificity", () => {
    const base = "We shipped the thing last week and it went fine overall.";
    const noFacts = q.analyzeContentQuality(base);
    const withFacts = q.analyzeContentQuality(base, { userFacts: { whatHappened: "we migrated 40 services over 6 weekends", result: "p95 latency dropped 320ms" } });
    assert(withFacts.specificity > noFacts.specificity, "facts must boost specificity");
  });

  await test("quality: hook repetition is flagged", () => {
    const post = "I wasted 3 hours debugging Redis today.\n\nHere is what happened.";
    const r = q.analyzeContentQuality(post, { recentHooks: ["I wasted 3 hours debugging Redis today. Here is what"] });
    assert(r.flags.some((f) => f.includes("Hook repeats")), `expected hook flag: ${r.flags}`);
  });

  await test("quality: correction instructions generated for failures", () => {
    const slop = "In today's fast-paced world, this is a game changer. The possibilities are endless!";
    const r = q.analyzeContentQuality(slop);
    const instr = q.buildCorrectionInstructions(r);
    assert(instr.includes("CORRECT THIS DRAFT") || instr.length === 0, "instructions or nothing");
    if (!r.passes) assert(instr.includes("CORRECT THIS DRAFT"), "failed analysis must give instructions");
  });
}

// ── 8. Edit learning signals ──────────────────────────────────

async function testEditLearning() {
  const el = await import("../src/lib/ai/edit-learning");

  await test("edit learning: detects cliché removal + opener change", () => {
    const ai = "I'm excited to share my thoughts on pricing.\n\nPricing is a game changer for growth. Let me explain.";
    const user = "We raised prices 30% and lost 8% of customers.\n\nRevenue still went up.";
    const s = el.computeEditSignals(ai, user);
    assert(s.openerChanged === true, "opener changed");
    assert(s.aiOpenerPattern !== undefined, "AI opener detected");
    assert(s.aiClicheRemoved.some((c) => c.includes("excited") || c.includes("game changer")), `cliches: ${s.aiClicheRemoved}`);
    // "We raised 30%…" → a number-led team-direct opener.
    assert(s.userOpenerStyle === "number" || s.userOpenerStyle === "team_direct", `style: ${s.userOpenerStyle}`);
  });

  await test("edit learning: detects shortening + formatting removal", () => {
    const ai = "This is a long and winding explanation of the concept that goes on and on with many words strung together in one enormous sentence. **Bold claim here.**\n\n🚀🔥 another line #AI #ML #Tech";
    const user = "Short version: it works.";
    const s = el.computeEditSignals(ai, user);
    assert(s.sentenceLengthShift === "shorter", `shift: ${s.sentenceLengthShift}`);
    assert(s.boldRemoved === true, "bold removed");
    assert(s.emojiRemoved === true, "emoji removed");
    assert(s.hashtagsRemoved === true, "hashtags removed");
    assert(s.lengthDeltaPct < -25, `length delta: ${s.lengthDeltaPct}`);
  });

  await test("edit learning: no-op edits produce no adjustments", () => {
    const text = "Same text, nothing changed here at all.";
    const s = el.computeEditSignals(text, text);
    assert(s.openerChanged === false && s.sentenceLengthShift === "same" && !s.emojiRemoved, "no signals");
  });
}

// ── 9. Keyword extraction (RAG) ───────────────────────────────

async function testKeywords() {
  const se = await import("../src/lib/ai/style-examples");

  await test("keyword extraction: informative terms, stop-words out", () => {
    const kws = se.extractKeywords("Postgres indexing with B-trees: how partial indexes saved our slowest query");
    assert(kws.includes("postgres"), `kws: ${kws}`);
    assert(!kws.includes("with") && !kws.includes("our"), "stop words must be filtered");
  });

  await test("keyword extraction: frequency ordering", () => {
    const kws = se.extractKeywords("redis redis redis cache cache queue");
    assert(kws[0] === "redis", `top kw: ${kws[0]}`);
  });
}

// ── Run ───────────────────────────────────────────────────────

async function main() {
  console.log("\nAI Architecture Upgrade — tests\n");
  await testClassification();
  await testRetry();
  await testCircuitBreaker();
  await testProviderOrder();
  await testRouterE2E();
  await testStructure();
  await testQuality();
  await testEditLearning();
  await testKeywords();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.log("Failures:");
    for (const f of failures) console.log("  -", f.slice(0, 200));
    process.exit(1);
  }
}

main();
