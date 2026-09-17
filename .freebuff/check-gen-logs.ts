/** Check generation_logs rows from the E2E run. npx tsx .freebuff/check-gen-logs.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const m = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)!;
const sql = neon(m[1].trim().replace(/^['"]|['"]$/g, "").split("?")[0]);

async function main() {
  const rows = await sql.query(
    `SELECT "requestType", provider, model, "taskComplexity", "latencyMs", status, "errorCode", retries
     FROM generation_logs ORDER BY "createdAt" DESC LIMIT 6`
  );
  console.log("generation_logs:", JSON.stringify(rows, null, 1));

  const u = await sql.query(`SELECT date, requests FROM generation_usage ORDER BY date DESC LIMIT 3`);
  console.log("generation_usage:", JSON.stringify(u));

  const s = await sql.query(`SELECT dimension, adjustment, strength FROM style_adjustments LIMIT 5`);
  console.log("style_adjustments:", JSON.stringify(s));
}

main();
