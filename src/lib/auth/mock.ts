/**
 * Mock Auth for Development
 *
 * In-memory session + mock user data. No database required.
 * Replace with real Better Auth in production.
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

function createSessionToken(userId?: string): string {
  const rand = Math.random().toString(36).slice(2, 15);
  return userId ? `mock_${Date.now()}_${rand}_${userId}` : `mock_${Date.now()}_${rand}`;
}

/**
 * Get session by token (for server-side cookie reading).
 * If token is not in memory (cross-process), create a session for it.
 */
export function getMockSessionByToken(token: string): MockSession | null {
  // Check in-memory first
  const existing = sessions.get(token);
  if (existing) return existing;

  // For dev resilience: if token contains a user ID, reconstruct the session
  // Token format: mock_<timestamp>_<random>_<userId>
  if (token.startsWith("mock_")) {
    const parts = token.split("_");
    const userId = parts[parts.length - 1];
    // Check if this is a known mock user
    for (const entry of Object.values(MOCK_USERS)) {
      if (entry.user.id === userId) {
        sessions.set(token, { user: entry.user });
        return { user: entry.user };
      }
    }
    // Default to first mock user for dev convenience
    const defaultSession = { user: MOCK_USER };
    sessions.set(token, defaultSession);
    return defaultSession;
  }

  return null;
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
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  return getMockSessionByToken(match[1]);
}

/**
 * Authenticate with email/password.
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
 * Sign up a new user.
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

// Initialize default session for quick dev access
createMockSession(MOCK_USER);
