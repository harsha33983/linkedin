/** Apply timestamptz migration. npx tsx .freebuff/apply-tz-migration.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const txt = fs.readFileSync(".env.local", "utf8");
const m = txt.match(/^DATABASE_URL=(.*)$/m)!;
let url = m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);

const STATEMENTS = [
  `ALTER TABLE "scraper_cache" ALTER COLUMN "fetchedAt" TYPE timestamptz`,
  `ALTER TABLE "scraper_cache" ALTER COLUMN "expiresAt" TYPE timestamptz`,
  `ALTER TABLE "viral_posts" ALTER COLUMN "fetchedAt" TYPE timestamptz`,
  `ALTER TABLE "viral_posts" ALTER COLUMN "createdAt" TYPE timestamptz`,
  `ALTER TABLE "viral_posts" ALTER COLUMN "updatedAt" TYPE timestamptz`,
];

async function main() {
  for (const stmt of STATEMENTS) {
    await sql.query(stmt);
    console.log("ok:", stmt.slice(0, 60));
  }
  // Verify: write a row and read it back, checking the instant round-trips.
  const now = new Date();
  await sql`
    INSERT INTO "scraper_cache" ("key", "keyword", "days", "postIds", "fetchedAt", "expiresAt", "status")
    VALUES ('__tz_check__', 'tz', 1, ARRAY[]::text[], ${now}, ${new Date(now.getTime() + 60_000)}, 'ok')
    ON CONFLICT ("key") DO UPDATE SET "fetchedAt" = EXCLUDED."fetchedAt"
  `;
  const [row] = await sql`SELECT "fetchedAt" FROM "scraper_cache" WHERE "key" = '__tz_check__'`;
  const delta = Math.abs(new Date((row as any).fetchedAt).getTime() - now.getTime());
  console.log("round-trip delta ms:", delta, delta < 5000 ? "OK" : "STILL SKEWED");
  await sql.query(`DELETE FROM "scraper_cache" WHERE "key" = '__tz_check__'`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
