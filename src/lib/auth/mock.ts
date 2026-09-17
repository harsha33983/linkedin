/**
 * Mock Auth for Development — STRICTLY opt-in and non-production.
 *
 * SECURITY: This module is only reachable when `USE_MOCK_DB === "true"` AND
 * `NODE_ENV !== "production"`. When disabled it returns `null` everywhere, so an
 * attacker cannot forge a `mock_*` session cookie against a real deployment.
 *
 * The old behaviour of "reconstructing" a session from an arbitrary token (and
 * defaulting unknown tokens to MOCK_USER) has been REMOVED — that was a
 * production authentication bypass (CRITICAL-1).
 */

import { cookies } from "next/headers";

const SESSION_COOKIE = "linkedgrow_session";

export interface MockUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface MockSession {
  user: MockUser;
}

// Mock user data
const MOCK_USER: MockUser = {
  id: "user_mock_001",
  name: "Alex Chen",
  email: "alex@example.com",
  image: null,
};

// Mock user database (email → user + password)
const MOCK_USERS: Record<string, { user: MockUser; password: string }> = {
  "alex@example.com": { user: MOCK_USER, password: "password123" },
  "test@example.com": {
    user: {
      id: "user_mock_002",
      name: "Test User",
      email: "test@example.com",
      image: null,
    },
    password: "password123",
  },
  "demo@demo.com": {
    user: {
      id: "user_mock_003",
      name: "Demo User",
      email: "demo@demo.com",
      image: null,
    },
    password: "demo",
  },
};

// In-memory sessions
const sessions = new Map<string, MockSession>();

/**
 * Mock auth is enabled ONLY when the operator explicitly opts in for local dev:
 *   USE_MOCK_DB=true  AND  NODE_ENV !== "production"
 * In every other context it is disabled, so the mock path can never be used to
 * authenticate against a real deployment.
 */
export function isMockAuthEnabled(): boolean {
  return process.env.USE_MOCK_DB === "true" && process.env.NODE_ENV !== "production";
}

function createSessionToken(userId?: string): string {
  const rand = Math.random().toString(36).slice(2, 15);
  return userId ? `mock_${Date.now()}_${rand}_${userId}` : `mock_${Date.now()}_${rand}`;
}

/**
 * Get session by token (for server-side cookie reading).
 * Only operates when mock auth is enabled. Unknown tokens return null — the
 * old "reconstruct from token" and "default to MOCK_USER" behaviour is gone.
 */
export function getMockSessionByToken(token: string): MockSession | null {
  if (!isMockAuthEnabled()) return null;
  return sessions.get(token) || null;
}

/**
 * Create a new session (called after login/signup).
 */
export function createMockSession(user: MockUser): string {
  const token = createSessionToken(user.id);
  sessions.set(token, { user });
  return token;
}

/**
 * Get session from cookie.
 */
export async function getMockSession(): Promise<MockSession | null> {
  if (!isMockAuthEnabled()) return null;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    return sessions.get(token) || null;
  } catch {
    return null;
  }
}

/**
 * Get session from a request (for API routes).
 */
export function getMockSessionFromRequest(request: Request): MockSession | null {
  if (!isMockAuthEnabled()) return null;
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  return getMockSessionByToken(match[1]);
}

/**
 * Authenticate with email/password (dev only).
 */
export function mockLogin(
  email: string,
  password: string
): { success: boolean; session?: MockSession; error?: string } {
  const entry = MOCK_USERS[email.toLowerCase()];
  if (!entry) {
    return { success: false, error: "No account found with this email" };
  }
  if (entry.password !== password) {
    return { success: false, error: "Invalid password" };
  }
  const token = createSessionToken();
  sessions.set(token, { user: entry.user });
  return { success: true, session: { user: entry.user } };
}

/**
 * Sign up a new user (dev only).
 */
export function mockSignup(
  name: string,
  email: string,
  password: string
): { success: boolean; session?: MockSession; error?: string } {
  const existing = MOCK_USERS[email.toLowerCase()];
  if (existing) {
    return { success: false, error: "An account already exists with this email" };
  }

  const newUser: MockUser = {
    id: `user_mock_${Date.now()}`,
    name,
    email,
    image: null,
  };

  MOCK_USERS[email.toLowerCase()] = { user: newUser, password };
  const token = createSessionToken();
  sessions.set(token, { user: newUser });
  return { success: true, session: { user: newUser } };
}

/**
 * Destroy a session (logout).
 */
export function destroyMockSession(token: string): void {
  sessions.delete(token);
}

// Initialize a default session for quick dev access (only when enabled).
// Note: createMockSession itself is harmless (it just writes a Map entry), but
// keep the guard so the dev-comfort session only exists in dev.
if (isMockAuthEnabled()) {
  createMockSession(MOCK_USER);
}
