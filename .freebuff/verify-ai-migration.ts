/** Verify AI upgrade tables exist. npx tsx .freebuff/verify-ai-migration.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const m = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)!;
const sql = neon(m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0]);

async function main() {
  const r = await sql.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'
     AND table_name IN ('writing_examples','generation_logs','prompts','generation_usage','style_adjustments')
     ORDER BY table_name`
  );
  console.log("tables:", (r.rows ?? r).map((x: any) => x.table_name ?? x));
  const p = await sql.query(`SELECT name, version, active FROM prompts ORDER BY name`);
  console.log("prompts:", p.rows ?? p);
}

main();
