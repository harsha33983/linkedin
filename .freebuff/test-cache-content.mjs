import { neon } from "@neondatabase/serverless";
import fs from "fs";
const txt = fs.readFileSync(".env.local", "utf8");
const m = txt.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);
const total = await sql`SELECT count(*)::int AS n FROM "viral_posts"`;
console.log("total posts:", total[0].n);
const bykw = await sql`SELECT "keyword", count(*)::int AS n FROM "viral_posts" GROUP BY "keyword" ORDER BY n DESC`;
for (const r of bykw) console.log("  kw:", r.keyword, "→", r.n);
// Does ANY row mention 'remote' or 'hiring' at all?
const probe = await sql`SELECT count(*)::int AS n FROM "viral_posts" WHERE "content" ILIKE '%remote%' OR "content" ILIKE '%hiring%'`;
console.log("mentioning remote/hiring:", probe[0].n);
