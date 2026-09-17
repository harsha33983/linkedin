/** Delete leftover mock viral rows. npx tsx .freebuff/clean-mock.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const m = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)!;
const url = m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);

async function main() {
  const a = await sql.query(`DELETE FROM viral_posts WHERE "sourcePostId" LIKE 'urn:li:mock:%'`);
  console.log("deleted mock rows:", (a as any).length ?? "ok");
  const c = await sql`SELECT count(*)::int AS n FROM "viral_posts"`;
  console.log("viral_posts rows now:", (c[0] as any).n);
  const kw = await sql`SELECT "keyword", count(*)::int AS n FROM "viral_posts" GROUP BY "keyword"`;
  console.log("by keyword:", JSON.stringify(kw));
  process.exit(0);
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
