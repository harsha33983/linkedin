/** Adds posts.errorMessage if missing (idempotent). npx tsx .freebuff/add-err-col.ts */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const txt = fs.readFileSync(".env.local", "utf8");
const m = txt.match(/^DATABASE_URL=(.*)$/m);
let url = m![1].trim().replace(/^['"]|['"]$/g, "").split("?")[0];
const sql = neon(url);

async function main() {
  await sql.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS "errorMessage" TEXT');
  console.log("posts.errorMessage ok");
}
main();
