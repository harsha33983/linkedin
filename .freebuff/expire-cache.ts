/** Force-expire a scraper_cache key. npx tsx .freebuff/expire-cache.ts <key> */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const key = process.argv[2] || "viral_posts:ai:30d";
const txt = fs.readFileSync(".env.local", "utf8");
const m = txt.match(/^DATABASE_URL=(.*)$/m)!;
const url = m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);

async function main() {
  const r = await sql`
    UPDATE "scraper_cache" SET "expiresAt" = now() - interval '1 hour'
    WHERE "key" = ${key}
  `;
  console.log("expired", key, "rows affected:", r.length);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
