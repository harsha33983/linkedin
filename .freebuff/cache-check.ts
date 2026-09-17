/** Check viral-posts cache tables and rows. npx tsx .freebuff/cache-check.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const txt = fs.readFileSync(".env.local", "utf8");
const m = txt.match(/^DATABASE_URL=(.*)$/m)!;
let url = m[1].trim().replace(/^['"]|['"]$/g, "");
if (!/^postgres/.test(url)) { console.error("no DATABASE_URL"); process.exit(1); }
url = url.split("?")[0];
const sql = neon(url);

async function main() {
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('viral_posts','scraper_cache')`;
  console.log("tables:", tables.map((t: any) => t.table_name));

  const posts = await sql`SELECT count(*)::int AS n FROM "viral_posts"`;
  console.log("viral_posts rows:", posts[0].n);

  try {
    const cache = await sql`SELECT "key", "fetchedAt", "expiresAt", jsonb_array_length(to_jsonb("postIds")) AS ids FROM "scraper_cache" ORDER BY "fetchedAt" DESC LIMIT 5`;
    console.log("scraper_cache rows:", JSON.stringify(cache, null, 1));
  } catch (e: any) {
    console.log("scraper_cache query FAILED:", String(e?.message || e).slice(0, 200));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
