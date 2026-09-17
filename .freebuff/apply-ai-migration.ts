/** Apply migrations-ai-upgrade.sql. npx tsx .freebuff/apply-ai-migration.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const txt = fs.readFileSync(".env.local", "utf8");
const m = txt.match(/^DATABASE_URL=(.*)$/m)!;
const url = m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);

const raw = fs.readFileSync("migrations-ai-upgrade.sql", "utf8");
const statements = raw
  .split(/;\s*\n/)
  .map((s) => s.replace(/^--.*$/gm, "").trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

async function main() {
  for (const stmt of statements) {
    try {
      await sql.query(stmt);
      console.log("OK:", stmt.slice(0, 60).replace(/\n/g, " "), "…");
    } catch (e: any) {
      console.error("FAIL:", e?.message?.slice(0, 160));
      console.error("  stmt:", stmt.slice(0, 100));
    }
  }
  // verify
  const tables = await sql.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('writing_examples','generation_logs','prompts','generation_usage','style_adjustments')`);
  console.log("tables now:", tables.rows?.map((r: any) => r.table_name));
}
main();
