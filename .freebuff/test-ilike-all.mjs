import { neon } from "@neondatabase/serverless";
import fs from "fs";
const txt = fs.readFileSync(".env.local", "utf8");
const m = txt.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);
const patterns = ["%remote%", "%work%"];
try {
  const rows = await sql`SELECT "authorName", "keyword" FROM "viral_posts"
    WHERE "content" ILIKE ALL(${patterns})
    LIMIT 3`;
  console.log("ARRAY PARAM OK, rows:", rows.length);
  for (const r of rows) console.log("  -", r.authorName?.slice(0, 30), "| kw:", r.keyword);
} catch (e) {
  console.log("ARRAY PARAM FAIL:", String(e.message).slice(0, 160));
}
