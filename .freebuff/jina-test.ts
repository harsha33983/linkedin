/** Print real cached post URLs. npx tsx .freebuff/jina-test.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const m = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)!;
const url = m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);

async function main() {
  const rows = await sql`
    SELECT "sourceUrl" FROM "viral_posts"
    WHERE "reactions" IS NOT NULL
    ORDER BY "viralScore" DESC LIMIT 2
  `;
  for (const r of rows as any[]) console.log((r as any).sourceUrl);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
