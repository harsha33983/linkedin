/**
 * Deterministic AI-pattern detector & content-quality engine.
 *
 * Zero LLM calls — pure text analysis. Detects the tell-tale patterns of
 * generic AI writing and scores the content on measurable characteristics.
 * Used as an internal quality gate: high AI-pattern risk triggers exactly ONE
 * bounded regeneration attempt (never infinite).
 *
 * Scores are internal QC signals. They do NOT predict LinkedIn reach.
 */

export interface ContentQuality {
  specificity: number;      // 0-100 — concrete details, numbers, named things
  originality: number;      // 0-100 — absence of clichés / generic phrasing
  clarity: number;          // 0-100 — readability, sentence variety
  readability: number;      // 0-100 — scannability for LinkedIn
  aiPatternRisk: number;    // 0-100 — higher = more AI-looking (BAD)
  flags: string[];          // human-readable findings
  passes: boolean;          // overall gate decision
}

// ── Pattern banks ──────────────────────────────────────────────

const GENERIC_OPENERS = [
  /^in today'?s (fast-?paced |ever-?(changing|evolving) )?world/i,
  /^in the (modern|digital) age/i,
  /^let'?s dive in/i,
  /^i'?m (excited|thrilled) to (share|announce)/i,
  /^here'?s (the thing|a thought|why this matters)/i,
  /^stop scrolling/i,
  /^we'?ve all been there/i,
  /^as (a |an )?(professional|developer|founder|entrepreneur)/i,
  /^day \d+ of (posting|learning)/i,
  /^hot take:/i,
  /^big news:/i,
  /^ buckle up/i,
];

const BUZZWORDS = [
  "game changer", "game-changer", "synergy", "synergies", "leverage" ,
  "unlock the power", "unleash", "revolutionize", "revolutionizing",
  "delve into", "delving", "tapestry", "landscape of", "in the realm of",
  "seamlessly integrate", "cutting-edge", "state-of-the-art", "best-in-class",
  "paradigm shift", "low-hanging fruit", "move the needle", "circle back",
  "boil the ocean", "10x your", "supercharge", "elevate your",
  "navigate the complexities", "embark on a journey", "testament to",
];

const GENERIC_CONCLUSIONS = [
  /the (future|possibilities) (are|is) (endless|limitless)/i,
  /what are (your|you) waiting for/i,
  /the choice is yours/i,
  /let'?s (embrace|shape|build) the future/i,
  /only time will tell/i,
  /at the end of the day,?\s*it'?s (all )?about/i,
  /thoughts\?\s*$/i,
  /agree\?\s*$/i,
];

const FAKE_EXPERIENCE_MARKERS = [
  /\bi remember (it like it was )?yesterday\b/i,   // often fabricated emotional framing
  /\bmy grandmother (always )?(used to )?said\b/i,
  /\ba study (shows|found)\b(?![^.]*\b(\d{4}|harvard|stanford|mit|gartner|mckinsey|linkedin)\b)/i, // unsourced "a study shows"
  /\b(studies show|research shows|experts say)\b/i, // unsourced authority
  /\b\d{1,2}% of (people|professionals)\b(?![^.]*\baccording\b)/i,  // unsourced stat
];

// ── Helpers ────────────────────────────────────────────────────

function sentences(text: string): string[] {
  return (text || "")
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function words(text: string): string[] {
  return (text || "").split(/\s+/).filter(Boolean);
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// ── Main detector ──────────────────────────────────────────────

export function analyzeContentQuality(
  content: string,
  opts: { userFacts?: { whatHappened?: string; whatLearned?: string; result?: string }; recentHooks?: string[] } = {}
): ContentQuality {
  const flags: string[] = [];
  const text = (content || "").trim();
  if (!text) {
    return { specificity: 0, originality: 0, clarity: 0, readability: 0, aiPatternRisk: 100, flags: ["empty content"], passes: false };
  }

  const lower = text.toLowerCase();
  const firstLine = text.split("\n")[0] || "";
  const sents = sentences(text);
  const ws = words(text);

  // ── Specificity ─────────────────────────────────────────────
  let specificity = 40;
  const numbers = text.match(/\b\d[\d,.]*\b/g)?.length || 0;
  specificity += Math.min(numbers * 6, 24);
  const firstPerson = (lower.match(/\b(i|my|me|we|our)\b/g) || []).length;
  specificity += Math.min(firstPerson * 1.5, 15);
  const timeMarkers = (lower.match(/\b(today|yesterday|last (week|month|year|night)|this morning|ago|monday|tuesday|wednesday|thursday|friday)\b/g) || []).length;
  specificity += Math.min(timeMarkers * 5, 15);
  // User facts present → boost (facts are the strongest specificity signal)
  const factsGiven = Object.values(opts.userFacts || {}).filter((v) => v && v.trim().length > 10).length;
  if (factsGiven > 0) specificity += 10 + factsGiven * 5;
  // Vague hedge words reduce it
  const vague = (lower.match(/\b(things|stuff|some|various|many|several|certain|etc)\b/g) || []).length;
  specificity -= Math.min(vague * 3, 20);
  specificity = clamp(specificity);
  if (specificity < 45) flags.push("Low specificity — few concrete details, numbers, or personal anchors");

  // ── Originality (absence of clichés) ────────────────────────
  let originality = 100;
  for (const re of GENERIC_OPENERS) {
    if (re.test(firstLine)) { originality -= 25; flags.push(`Generic opener: "${firstLine.slice(0, 60)}"`); break; }
  }
  const buzzFound = BUZZWORDS.filter((b) => lower.includes(b));
  originality -= Math.min(buzzFound.length * 10, 40);
  if (buzzFound.length) flags.push(`Buzzwords: ${buzzFound.slice(0, 4).join(", ")}`);
  for (const re of GENERIC_CONCLUSIONS) {
    if (re.test(text)) { originality -= 12; flags.push("Generic conclusion"); break; }
  }
  const fake = FAKE_EXPERIENCE_MARKERS.filter((re) => re.test(text));
  if (fake.length) { originality -= fake.length * 15; flags.push("Possible fabricated experience/unsourced claim"); }
  originality = clamp(originality);

  // ── AI-pattern risk (the headline metric) ───────────────────
  let risk = 0;
  // 1. Repetitive sentence openers
  const openers = sents.map((s) => s.split(/\s+/)[0]?.toLowerCase()).filter(Boolean);
  const openerFreq = new Map<string, number>();
  for (const o of openers) openerFreq.set(o, (openerFreq.get(o) || 0) + 1);
  const openerEntries = Array.from(openerFreq.values());
  const maxOpenerShare = Math.max(...openerEntries) / Math.max(openers.length, 1);
  if (openers.length >= 4 && maxOpenerShare > 0.5) { risk += 20; flags.push(`Repetitive sentence openers ("${Array.from(openerFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]}…")`); }

  // 2. Uniform sentence lengths (AI signature: low variance)
  const lens = sents.map((s) => words(s).length);
  if (lens.length >= 4) {
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lens.length);
    if (sd < 3) { risk += 15; flags.push("Uniform sentence lengths — robotic rhythm"); }
  }

  // 3. Rule-of-three abuse ("X, Y, and Z" triples everywhere)
  const triples = (text.match(/\w+,\s+\w+,?\s+and\s+\w+/gi) || []).length;
  if (triples >= 3) { risk += 15; flags.push(`${triples} "X, Y and Z" triads — AI fingerprint`); }

  // 4. Emoji load
  // Emoji count via surrogate-pair ranges (no 'u' flag: ES5 target compatible)
  const emojiMatches = text.match(/[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]/g) || [];
  const emojis = emojiMatches.length;
  if (emojis > 6) { risk += Math.min((emojis - 6) * 5, 20); flags.push(`${emojis} emojis — excessive`); }

  // 5. Hashtag load
  const hashtags = text.match(/#\w+/g)?.length || 0;
  if (hashtags > 5) { risk += Math.min((hashtags - 5) * 6, 20); flags.push(`${hashtags} hashtags — excessive`); }

  // 6. Formatting tells
  if (/\*\*[^*]+\*\*/.test(text)) { risk += 10; flags.push("Markdown bold (**) — LinkedIn doesn't render it"); }
  if ((text.match(/\b—\b/g) || []).length >= 3) { risk += 10; flags.push("Em-dash heavy"); }
  if (/\b(let'?s crack on|buckle up|here'?s the kicker|plot twist:)\b/i.test(text)) { risk += 10; flags.push("AI-ism phrase"); }

  // 7. Hook repetition vs recent posts
  if (opts.recentHooks?.length) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    const hookStart = norm(firstLine).slice(0, 40);
    if (hookStart && opts.recentHooks.some((h) => norm(h).startsWith(hookStart))) {
      risk += 25; flags.push("Hook repeats a recent post's hook");
    }
  }

  // 8. Fabrication markers are also an AI-risk signal (not just originality)
  if (fake.length) risk += Math.min(fake.length * 10, 20);

  // 9. Generic opener is a strong AI tell
  if (GENERIC_OPENERS.some((re) => re.test(firstLine))) risk += 15;

  risk = clamp(risk);

  // ── Clarity & readability ───────────────────────────────────
  const avgLen = ws.length / Math.max(sents.length, 1);
  const longSentences = lens.filter((l) => l > 28).length;
  let clarity = clamp(100 - Math.abs(avgLen - 15) * 4 - longSentences * 6);
  const paraCount = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const lineBreaks = (text.match(/\n/g) || []).length;
  const readability = clamp(
    40 + Math.min(paraCount * 8, 32) + Math.min(lineBreaks * 2, 18) - Math.min(longSentences * 5, 20)
  );

  const passes = risk <= 45 && originality >= 55 && specificity >= 40 && text.length >= 80;

  return { specificity, originality, clarity, readability, aiPatternRisk: risk, flags, passes };
}

/**
 * Bounded regeneration policy: analyze → if fail and attempts remain →
 * regenerate once with corrective instructions → re-analyze → return best.
 * Hard cap of 1 regeneration. Never loops.
 */
export const MAX_REGENERATIONS = 1;

export function shouldRegenerate(q: ContentQuality, attempt: number): boolean {
  return !q.passes && attempt < MAX_REGENERATIONS;
}

/** Corrective prompt fragment derived from failed quality analysis. */
export function buildCorrectionInstructions(q: ContentQuality): string {
  const fixes: string[] = [];
  if (q.aiPatternRisk > 45) fixes.push("- Vary sentence lengths dramatically. Break the uniform rhythm. Use a fragment occasionally.");
  if (q.flags.some((f) => f.startsWith("Generic opener"))) fixes.push("- Rewrite the first line. Start with something specific that happened, a number, or an unusual observation. Never 'In today's world' or 'I'm excited to share'.");
  if (q.flags.some((f) => f.startsWith("Buzzwords"))) fixes.push("- Remove all corporate buzzwords and hype language. Plain words only.");
  if (q.flags.some((f) => f.startsWith("Low specificity"))) fixes.push("- Add concrete specifics: what exactly happened, real numbers the user provided, named tools/moments.");
  if (q.flags.some((f) => f.startsWith("Markdown"))) fixes.push("- Remove ** bold markers. Use plain text with line breaks.");
  if (q.flags.some((f) => f.includes("emojis"))) fixes.push("- Remove most emojis. Keep at most 1-2 if the user habitually uses them.");
  if (q.flags.some((f) => f.includes("hashtags"))) fixes.push("- Cut hashtags to 3-5 maximum.");
  if (q.flags.some((f) => f.startsWith("Hook repeats"))) fixes.push("- The hook is too similar to a recent post. Write a completely different opening.");
  return fixes.length ? `\nCORRECT THIS DRAFT (fix these specific problems):\n${fixes.join("\n")}\n` : "";
}
