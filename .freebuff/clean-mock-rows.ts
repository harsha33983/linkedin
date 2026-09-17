/** Deletes mock viral posts + their cache windows. npx tsx .freebuff/clean-mock-rows.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const m = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m);
const url = m![1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);

async function main() {
  // Only remove MOCK data — never wipe live scraped rows or unrelated
  // cache windows (this used to run a blanket DELETE FROM scraper_cache).
  const a = await sql.query("DELETE FROM viral_posts WHERE \"sourcePostId\" LIKE 'urn:li:mock:%'");
  const b = await sql.query("DELETE FROM scraper_cache WHERE \"key\" LIKE '%:__mock%' OR \"status\" = 'mock'");
  console.log("deleted mock rows:", a.rowCount, "| cleared mock cache windows:", b.rowCount);
}
main();
