/** List real (non-mock) post URLs + count mock rows. npx tsx .freebuff/real-urls.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const m = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)!;
const sql = neon(m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0]);

const mockCount = await sql`SELECT COUNT(*)::int AS n FROM "viral_posts" WHERE "sourcePostId" LIKE 'urn:li:mock:%'`;
console.log("mock rows:", mockCount[0].n);

const real = await sql`
  SELECT "sourceUrl", "authorName", "viralScore", "publishedAt"
  FROM "viral_posts"
  WHERE "sourcePostId" NOT LIKE 'urn:li:mock:%'
  ORDER BY "fetchedAt" DESC LIMIT 5`;
for (const r of real) console.log(r.publishedAt?.slice(0, 10), "|", r.authorName, "|", r.sourceUrl);
