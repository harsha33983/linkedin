import { betterAuth } from "better-auth";
import { Pool } from "@neondatabase/serverless";

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  // Dev servers may be reached via 127.0.0.1 or localhost on varying ports;
  // trust the configured app URL plus loopback variants so sign-in isn't 403'd.
  trustedOrigins: ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
});
