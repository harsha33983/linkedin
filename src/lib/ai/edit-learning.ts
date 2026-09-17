/**
 * Edit Learning — turns user edits into learned style adjustments.
 *
 * When a user edits an AI draft, the delta between AI_DRAFT and FINAL is the
 * strongest personalization signal available. This module:
 *   1. Computes a structured diff (opener, sentence length, emoji/hashtag
 *      usage, formatting, length change, vocabulary).
 *   2. Persists durable patterns into `style_adjustments` (aggregated —
 *      a single edit is weak evidence; repeated patterns gain strength).
 *   3. Emits a neutral "style adjustments" prompt block on the next
 *      generation so the model writes closer to how the user actually edits.
 *
 * Never learns a single edit as a permanent preference — aggregation with
 * strength thresholds guards against one-off noise.
 */

import { randomUUID } from "crypto";

export interface EditSignals {
  openerChanged: boolean;
  aiOpenerPattern?: string;      // e.g. "In today's world…" (AI cliché)
  userOpenerStyle?: string;      // "short_direct" | "question" | "personal_story" | "number"
  sentenceLengthShift: "shorter" | "longer" | "same";
  emojiRemoved: boolean;
  emojiAdded: boolean;
  hashtagsRemoved: boolean;
  hashtagsAdded: boolean;
  formattingRemoved: boolean;    // markdown **, bullets, headers removed
  boldRemoved: boolean;
  lengthDeltaPct: number;        // final vs draft
  ctaChanged: boolean;
  aiClicheRemoved: string[];     // clichés present in draft, absent in final
}

// ── Diff computation ──────────────────────────────────────────

const CLICHES = [
  "in today's fast-paced world", "let's dive in", "game changer", "game-changer",
  "i'm excited to share", "i'm thrilled to", "here's the thing", "stop scrolling",
  "buckle up", "unlock the power", "in the realm of", "delve into", "tapestry",
  "revolutionize", "seamlessly", "synergy", "leverage the power",
];

function firstLine(t: string): string {
  return (t || "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "";
}

function classifyOpener(line: string): string {
  const l = line.toLowerCase();
  if (!l) return "none";
  if (l.endsWith("?")) return "question";
  if (/^(i |my |when i |last |yesterday|today)/.test(l)) return "personal_story";
  if (/^\d/.test(l) || /\b\d+([.,]\d+)?%/.test(l)) return "number";
  if (/^(we|our) /.test(l)) return "team_direct";
  if (l.split(/\s+/).length <= 6) return "short_direct";
  return "direct_statement";
}

function countEmojis(t: string): number {
  return ((t || "").match(/[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]/g) || []).length;
}

function countHashtags(t: string): number {
  return ((t || "").match(/#\w+/g) || []).length;
}

function wordCount(t: string): number {
  return (t || "").split(/\s+/).filter(Boolean).length;
}

export function computeEditSignals(aiDraft: string, final: string): EditSignals {
  const draft = aiDraft || "";
  const fin = final || "";
  const dLine = firstLine(draft);
  const fLine = firstLine(fin);

  const dSent = draft.split(/[.!?]+/).filter((s) => s.trim()).map((s) => s.split(/\s+/).length);
  const fSent = fin.split(/[.!?]+/).filter((s) => s.trim()).map((s) => s.split(/\s+/).length);
  const dAvg = dSent.length ? dSent.reduce((a, b) => a + b, 0) / dSent.length : 0;
  const fAvg = fSent.length ? fSent.reduce((a, b) => a + b, 0) / fSent.length : 0;

  const dEmoji = countEmojis(draft);
  const fEmoji = countEmojis(fin);
  const dTags = countHashtags(draft);
  const fTags = countHashtags(fin);

  const clicheRemoved = CLICHES.filter(
    (c) => draft.toLowerCase().includes(c) && !fin.toLowerCase().includes(c)
  );

  const dwc = wordCount(draft);
  const fwc = wordCount(fin);

  return {
    openerChanged: dLine !== fLine,
    aiOpenerPattern: /^(in today|let's dive|i'm (excited|thrilled)|stop scrolling|here's the thing)/i.test(dLine)
      ? dLine.slice(0, 60)
      : undefined,
    userOpenerStyle: dLine !== fLine ? classifyOpener(fLine) : undefined,
    sentenceLengthShift: fAvg < dAvg - 3 ? "shorter" : fAvg > dAvg + 3 ? "longer" : "same",
    emojiRemoved: dEmoji > 0 && fEmoji < dEmoji,
    emojiAdded: fEmoji > dEmoji,
    hashtagsRemoved: dTags > 0 && fTags < dTags,
    hashtagsAdded: fTags > dTags,
    formattingRemoved: draft.includes("**") && !fin.includes("**"),
    boldRemoved: draft.includes("**") && !fin.includes("**"),
    lengthDeltaPct: dwc > 0 ? Math.round(((fwc - dwc) / dwc) * 100) : 0,
    ctaChanged: lastLine(draft) !== lastLine(fin),
    aiClicheRemoved: clicheRemoved,
  };
}

function lastLine(t: string): string {
  const lines = (t || "").split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] || "";
}

// ── Persistence (aggregated learning) ─────────────────────────

/** Signal → (dimension, adjustment) mappings that are worth persisting. */
function signalsToAdjustments(s: EditSignals): Array<{ dimension: string; adjustment: string }> {
  const out: Array<{ dimension: string; adjustment: string }> = [];

  if (s.openerChanged && s.userOpenerStyle) {
    out.push({ dimension: "opener", adjustment: `prefer_${s.userOpenerStyle}` });
  }
  if (s.aiOpenerPattern) {
    out.push({ dimension: "opener", adjustment: "avoid_ai_cliche_opener" });
  }
  if (s.sentenceLengthShift === "shorter") out.push({ dimension: "sentenceLength", adjustment: "shorter" });
  if (s.sentenceLengthShift === "longer") out.push({ dimension: "sentenceLength", adjustment: "longer" });
  if (s.emojiRemoved) out.push({ dimension: "emoji", adjustment: "fewer" });
  if (s.hashtagsRemoved) out.push({ dimension: "hashtag", adjustment: "fewer" });
  if (s.formattingRemoved || s.boldRemoved) out.push({ dimension: "formatting", adjustment: "plain_text" });
  if (s.lengthDeltaPct <= -25) out.push({ dimension: "formatting", adjustment: "shorter_posts" });
  for (const _ of s.aiClicheRemoved) {
    out.push({ dimension: "vocabulary", adjustment: "no_ai_cliches" });
    break; // one record per edit
  }
  return out;
}

const STRENGTH_THRESHOLD = 2.0; // must appear in ≥2 edits (or 1 strong signal) before it shapes prompts

/**
 * Record a user edit. Cheap, non-blocking on failure. Only called when the
 * edit meaningfully changed the draft (avoid learning no-op saves).
 */
export async function recordUserEdit(
  userId: string,
  aiDraft: string,
  final: string
): Promise<void> {
  try {
    // Lazy DB import: the pure-signal functions stay testable without env.
    const { sql } = await import("@/lib/db");
    const signals = computeEditSignals(aiDraft, final);

    // No-op edit → nothing to learn.
    const meaningful =
      signals.openerChanged ||
      signals.sentenceLengthShift !== "same" ||
      signals.emojiRemoved || signals.hashtagsRemoved ||
      signals.formattingRemoved || signals.aiClicheRemoved.length > 0 ||
      Math.abs(signals.lengthDeltaPct) >= 25;
    if (!meaningful) return;

    const adjustments = signalsToAdjustments(signals);
    for (const { dimension, adjustment } of adjustments) {
      await sql`
        INSERT INTO style_adjustments (id, "userId", dimension, adjustment, strength, samples)
        VALUES (${randomUUID()}, ${userId}, ${dimension}, ${adjustment}, 1, 1)
        ON CONFLICT ("userId", dimension, adjustment)
        DO UPDATE SET strength = style_adjustments.strength + 1,
                      samples = style_adjustments.samples + 1,
                      "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      `;
    }

    // Store the final as a style example (the user's own edited voice).
    const { storeWritingExample } = await import("./style-examples");
    await storeWritingExample(userId, final, "FINAL_EDIT");
  } catch (err: any) {
    console.warn("[edit-learning] record failed:", String(err?.message || err).slice(0, 120));
  }
}

/**
 * Read the user's learned adjustments above the strength threshold,
 * formatted as a prompt block. Empty string when nothing learned yet.
 */
export async function getLearnedStyleAdjustments(userId: string): Promise<string> {
  try {
    const { sql } = await import("@/lib/db");
    const rows = await sql`
      SELECT dimension, adjustment, strength, samples
      FROM style_adjustments
      WHERE "userId" = ${userId} AND strength >= ${STRENGTH_THRESHOLD}
      ORDER BY strength DESC
      LIMIT 10
    `;
    if (rows.length === 0) return "";

    const humanized: Record<string, Record<string, string>> = {
      opener: {
        prefer_short_direct: "Open with a short, direct statement.",
        prefer_question: "Open with a question.",
        prefer_personal_story: "Open with a first-person moment.",
        prefer_number: "Open with a number or concrete figure.",
        prefer_team_direct: "Open with a plain statement of what happened (first-person plural is fine).",
        prefer_direct_statement: "Open with a plain, direct statement — no throat-clearing.",
        avoid_ai_cliche_opener: "Never open with AI clichés like 'In today's world…' or 'I'm excited to share'.",
      },
      sentenceLength: {
        shorter: "The user consistently shortens sentences — write tighter, shorter sentences.",
        longer: "The user prefers slightly longer, flowing sentences.",
      },
      emoji: { fewer: "The user removes emojis from drafts — keep emoji use minimal (0-1).", },
      hashtag: { fewer: "The user trims hashtags — use at most 3." },
      formatting: {
        plain_text: "The user strips formatting (bold/markdown) — plain text and line breaks only.",
        shorter_posts: "The user cuts post length substantially — be concise.",
      },
      vocabulary: { no_ai_cliches: "The user deletes AI clichés — plain, concrete language only." },
    };

    const lines: string[] = [];
    for (const r of rows as any[]) {
      const text = humanized[r.dimension]?.[r.adjustment];
      if (text) lines.push(`- ${text} (seen in ${r.samples} edit${r.samples === 1 ? "" : "s"})`);
    }
    if (lines.length === 0) return "";

    return [
      `\nLEARNED STYLE ADJUSTMENTS (from how this user edits AI drafts — follow these):`,
      ...lines,
    ].join("\n");
  } catch (err: any) {
    console.warn("[edit-learning] read failed:", String(err?.message || err).slice(0, 120));
    return "";
  }
}
