/** Verify cache rows. npx tsx .freebuff/cache-verify.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const txt = fs.readFileSync(".env.local", "utf8");
const m = txt.match(/^DATABASE_URL=(.*)$/m)!;
let url = m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);

async function main() {
  const rows = await sql`SELECT "key", "fetchedAt", "expiresAt" FROM "scraper_cache" ORDER BY "fetchedAt" DESC`;
  console.log("scraper_cache rows in .env.local DB:", JSON.stringify(rows, null, 1));
  const now = new Date();
  console.log("now:", now.toISOString());
  for (const r of rows) {
    const fresh = new Date((r as any).expiresAt).getTime() > now.getTime();
    console.log(`${(r as any).key}: fresh=${fresh}`);
  }
  const cnt = await sql`SELECT count(*)::int AS n FROM "viral_posts"`;
  console.log("viral_posts rows:", cnt[0].n);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
