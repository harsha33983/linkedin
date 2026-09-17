/**
 * Applies migrations-viral-posts.sql against the Neon database.
 * Usage: npx tsx .freebuff/apply-viral-migration.ts
 */
import { neon } from "@neondatabase/serverless";
import fs from "fs";

function loadEnv(): string {
  // From .env.local (first) or .env
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = fs.readFileSync(f, "utf8");
      const m = txt.match(/^DATABASE_URL=(.*)$/m);
      if (m) {
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    } catch {}
  }
  throw new Error("DATABASE_URL not found");
}

const url = process.env.DATABASE_URL || loadEnv();
// Neon serverless driver needs the raw postgres URL (strip query params except sslmode)
const clean = url.split("?")[0];

const sql = neon(clean);
const stmts = fs
  .readFileSync("migrations-viral-posts.sql", "utf8")
  .split(";")
  .map((s) =>
    s
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .trim()
  )
  .filter((s) => s.length > 0);

async function main() {
for (const s of stmts) {
  const label = s.replace(/\s+/g, " ").slice(0, 60);
  try {
    await sql.query(s);
    console.log("ok:", label);
  } catch (e: any) {
    console.error("FAIL:", label, "→", e.message);
  }
}
console.log("migration done");
}
main();
