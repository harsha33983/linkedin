import { auth } from "./server";
import { headers } from "next/headers";
import { getMockSessionFromRequest, getMockSessionByToken } from "./mock";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export async function getSession(request?: Request): Promise<{ user: SessionUser } | null> {
  // If request provided, use it directly (for API routes)
  if (request) {
    return getSessionFromRequest(request);
  }

  // Try Better Auth first (for server components using headers())
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });
    if (session?.user?.id) return session as { user: SessionUser } | null;
  } catch {}

  // Fallback: mock session from cookie via headers()
  try {
    const h = await headers();
    const cookieHeader = h.get("cookie") || "";
    const match = cookieHeader.match(/linkedgrow_session=([^;]+)/);
    if (match) {
      const mockSession = getMockSessionByToken(match[1]);
      if (mockSession) return mockSession as { user: SessionUser } | null;
    }
  } catch {}

  return null;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return session;
}

export async function requireAuthFromRequest(request: Request): Promise<string> {
  // Try Better Auth first
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user?.id) return session.user.id;
  } catch {}

  // Fallback: mock session (reads "linkedgrow_session" cookie)
  const mockSession = getMockSessionFromRequest(request);
  if (mockSession?.user?.id) return mockSession.user.id;

  throw new Error("Unauthorized");
}

export async function getSessionFromRequest(request: Request): Promise<{ user: SessionUser } | null> {
  // Try Better Auth first
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user?.id) return session as { user: SessionUser } | null;
  } catch {}

  // Fallback: mock session
  const mockSession = getMockSessionFromRequest(request);
  if (mockSession) return mockSession as { user: SessionUser } | null;

  return null;
}
