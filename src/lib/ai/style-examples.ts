/**
 * Style Examples — lightweight retrieval-augmented generation (RAG).
 *
 * No pgvector on this database (plain Postgres), so relevance uses keyword
 * overlap: extract informative terms from the topic, score each stored
 * example, return the top 3–5. This is deliberately simple and cheap — it
 * runs on every generation with zero LLM cost.
 *
 * Examples are style/structure references ONLY. The prompt explicitly
 * forbids copying sentences from them.
 */

import { randomUUID } from "crypto";

export type ExampleSource = "USER_POST" | "UPLOADED_EXAMPLE" | "FINAL_EDIT" | "IMPORTED_CONTENT";

const STOP_WORDS = new Set(
  ("a,an,the,and,or,but,if,then,so,because,as,of,to,in,on,at,for,with,about,from,by,is,are,was,were,be,been,being," +
    "i,my,me,you,your,we,our,they,their,it,this,that,these,those,what,which,who,how,why,when,where," +
    "do,does,did,have,has,had,will,would,can,could,should,just,really,very,not,no,yes,one,two,three," +
    "here,there,now,new,like,get,got,make,made,go,went,see,saw,think,thought,know,knew,thing,things")
    .split(",")
);

/** Extract informative keywords from text (deterministic, no NLP dependency). */
export function extractKeywords(text: string, max: number = 12): string[] {
  const words = (text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  return Array.from(freq.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, max)
    .map(([w]) => w);
}

/** Store a writing example for a user (idempotent on identical content). */
export async function storeWritingExample(
  userId: string,
  content: string,
  source: ExampleSource
): Promise<void> {
  const trimmed = (content || "").trim();
  if (trimmed.length < 40) return; // too short to be a style example
  try {
    // Lazy DB import: keyword extraction stays testable without env.
    const { sql } = await import("@/lib/db");
    const existing = await sql`
      SELECT id FROM writing_examples
      WHERE "userId" = ${userId} AND LEFT(content, 200) = LEFT(${trimmed}, 200)
      LIMIT 1
    `;
    if (existing.length > 0) return;

    const kws = extractKeywords(trimmed);
    await sql`
      INSERT INTO writing_examples (id, "userId", content, source, keywords)
      VALUES (${randomUUID()}, ${userId}, ${trimmed}, ${source}, ${`{${kws.join(",")}}`}::text[])
    `;
  } catch (err: any) {
    console.warn("[style-examples] store failed:", String(err?.message || err).slice(0, 120));
  }
}

export interface StyleExample {
  content: string;
  source: string;
  score: number;
}

/**
 * Retrieve the user's most relevant writing examples for a topic.
 * Scores by keyword overlap between topic and example keywords; ties broken
 * by recency. Returns up to `limit` (default 5, min 3).
 */
export async function retrieveStyleExamples(
  userId: string,
  topic: string,
  limit: number = 5
): Promise<StyleExample[]> {
  try {
    const { sql } = await import("@/lib/db");
    const rows = await sql`
      SELECT content, source, keywords, "createdAt"
      FROM writing_examples
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" DESC
      LIMIT 200
    `;
    if (rows.length === 0) return [];

    const topicKeywords = new Set(extractKeywords(topic, 10));
    const scored = (rows as any[]).map((r) => {
      const kws: string[] = Array.isArray(r.keywords) ? r.keywords : [];
      let score = 0;
      const topicList = Array.from(topicKeywords);
      for (const k of kws) {
        if (topicKeywords.has(k)) score += 2;
        else {
          // partial credit: shared prefix (crude stem match)
          for (const t of topicList) {
            if (k.length >= 5 && t.length >= 5 && (k.startsWith(t.slice(0, 5)) || t.startsWith(k.slice(0, 5)))) {
              score += 1;
              break;
            }
          }
        }
      }
      // Recency tiebreaker (newer is slightly better)
      const ageDays = (Date.now() - new Date(r.createdAt).getTime()) / 86_400_000;
      return {
        content: r.content as string,
        source: r.source as string,
        score: score + Math.max(0, 1 - ageDays / 365),
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(3, limit));
    // If nothing overlaps at all, still return the user's 3 most recent so the
    // generator always has some style reference.
    if (top.every((t) => t.score < 1)) {
      return scored.slice(0, 3).map((t) => ({ ...t, score: 0 }));
    }
    return top;
  } catch (err: any) {
    console.warn("[style-examples] retrieval failed:", String(err?.message || err).slice(0, 120));
    return [];
  }
}

/** Format examples for the generation prompt (style reference only). */
export function formatExamplesForPrompt(examples: StyleExample[]): string {
  if (examples.length === 0) return "";
  return [
    `\nUSER'S OWN WRITING EXAMPLES (style/structure reference ONLY):`,
    ...examples.map((e, i) => `--- Example ${i + 1} (${e.source}) ---\n${e.content.slice(0, 600)}`),
    `RULES FOR EXAMPLES: Learn the rhythm, vocabulary level, and structure. NEVER reuse a sentence or distinctive phrase from them. Write something new about the topic.`,
  ].join("\n");
}
