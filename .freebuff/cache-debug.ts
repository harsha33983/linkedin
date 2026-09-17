/** Debug scraper_cache read/write. npx tsx .freebuff/cache-debug.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const txt = fs.readFileSync(".env.local", "utf8");
const m = txt.match(/^DATABASE_URL=(.*)$/m)!;
let url = m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);

async function main() {
  const key = "viral_posts:ai:30d";
  // Exact same query shape as getCacheState
  try {
    const [row] = await sql`SELECT "fetchedAt", "expiresAt" FROM "scraper_cache" WHERE "key" = ${key} LIMIT 1`;
    console.log("getCacheState query result:", row);
    if (row) {
      console.log("expiresAt parsed:", new Date((row as any).expiresAt).toISOString());
      console.log("fresh:", new Date((row as any).expiresAt).getTime() > Date.now());
    }
  } catch (e: any) {
    console.log("getCacheState query THREW:", String(e?.message || e).slice(0, 300));
  }

  // Current rows
  const rows = await sql`SELECT "key", "fetchedAt", "expiresAt" FROM "scraper_cache"`;
  console.log("all rows:", JSON.stringify(rows));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
