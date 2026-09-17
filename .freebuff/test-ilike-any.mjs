import { neon } from "@neondatabase/serverless";
import fs from "fs";
const txt = fs.readFileSync(".env.local", "utf8");
const m = txt.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);
const patterns = ["%remote work%", "%hiring%"];
const rows = await sql`SELECT "authorName", "keyword", LEFT("content", 60) AS c FROM "viral_posts"
  WHERE "content" ILIKE ANY(${patterns})
  ORDER BY "viralScore" DESC LIMIT 5`;
console.log("rows:", rows.length);
for (const r of rows) console.log("  -", r.authorName?.slice(0, 30), "| kw:", r.keyword, "|", (r.c || "").slice(0, 45));
const cnt = await sql`SELECT count(*)::int AS n FROM "viral_posts" WHERE "content" ILIKE ANY(${patterns})`;
console.log("total matching:", cnt[0].n);
