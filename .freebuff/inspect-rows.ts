/** Inspect viral_posts rows. npx tsx .freebuff/inspect-rows.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const m = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)!;
const url = m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);

async function main() {
  const rows = await sql`
    SELECT "sourcePostId", "source", "authorName", "viralScore", "reactions",
           "fetchedAt", left("sourceUrl", 60) AS url
    FROM "viral_posts"
    ORDER BY "viralScore" DESC
    LIMIT 40
  `;
  for (const r of rows as any[]) {
    console.log(
      `${r.sourcePostId?.slice(0, 26) ?? "null"} | ${r.source} | ${r.authorName?.slice(0, 18) ?? "-"} | s=${r.viralScore} | r=${r.reactions} | ${r.url}`
    );
  }
  process.exit(0);
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
