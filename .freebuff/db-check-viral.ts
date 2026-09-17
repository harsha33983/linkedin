/** Quick DB check. npx tsx .freebuff/db-check-viral.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const m = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m);
const url = m![1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);

async function main() {
  const a: any = await sql.query("SELECT COUNT(*)::int AS n FROM viral_posts WHERE \"sourcePostId\" LIKE 'urn:li:mock:%'");
  const b: any = await sql.query("SELECT COUNT(*)::int AS n FROM viral_posts");
  const c: any = await sql.query("SELECT COUNT(*)::int AS n FROM scraper_cache");
  const n = (r: any) => (Array.isArray(r) ? r[0]?.n : r?.rows?.[0]?.n);
  console.log("mock rows:", n(a), "| total posts:", n(b), "| cache windows:", n(c));
}
main();
