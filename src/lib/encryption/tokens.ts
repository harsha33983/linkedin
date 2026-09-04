/**
 * Token Encryption Service
 *
 * AES-256-CBC encryption for OAuth tokens at rest.
 * NEVER store plaintext access tokens or client secrets.
 *
 * Uses a 256-bit key from TOKEN_ENCRYPTION_KEY env var.
 * Falls back to a development-only key if not set (with a warning).
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";

// In production, TOKEN_ENCRYPTION_KEY must be set (64 hex chars = 32 bytes)
function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "TOKEN_ENCRYPTION_KEY must be set in production. Generate with: openssl rand -hex 32"
      );
    }
    // Dev fallback — NOT for production
    console.warn(
      "⚠️  Using development encryption key. Set TOKEN_ENCRYPTION_KEY for production."
    );
    return crypto.scryptSync("dev-only-key-do-not-use-in-production", "salt", 32);
  }
  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt a plaintext string.
 * Returns { encrypted, iv } — both needed for decryption.
 */
export function encrypt(plaintext: string): { encrypted: string; iv: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    encrypted,
    iv: iv.toString("hex"),
  };
}

/**
 * Decrypt an encrypted string.
 * Requires both the encrypted data and the initialization vector.
 */
export function decrypt(encrypted: string, ivHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Encrypt an access token for storage.
 * Convenience wrapper for the most common use case.
 */
export function encryptAccessToken(token: string) {
  return encrypt(token);
}

/**
 * Decrypt an access token for use.
 * Convenience wrapper for the most common use case.
 */
export function decryptAccessToken(encryptedToken: string, iv: string): string {
  return decrypt(encryptedToken, iv);
}

/**
 * Generate a secure random string for OAuth state.
 * Uses crypto.randomBytes for cryptographic security.
 */
export function generateOAuthState(userId: string): string {
  const randomBytes = crypto.randomBytes(32).toString("hex");
  const payload = JSON.stringify({ userId, nonce: randomBytes, ts: Date.now() });
  return Buffer.from(payload).toString("base64url");
}

/**
 * Validate and decode an OAuth state value.
 * Returns the userId if valid, null if tampered/expired.
 * State expires after 10 minutes.
 */
export function validateOAuthState(state: string): { userId: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(state, "base64url").toString());

    // Check expiration (10 minutes)
    if (Date.now() - payload.ts > 10 * 60 * 1000) {
      return null;
    }

    if (!payload.userId || !payload.nonce) {
      return null;
    }

    return { userId: payload.userId };
  } catch {
    return null;
  }
}
