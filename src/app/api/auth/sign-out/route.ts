import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth/server";

const SESSION_COOKIE = "better-auth.session_token";
const MOCK_COOKIE = "linkedgrow_session";

/**
 * POST /api/auth/sign-out
 *
 * Revokes the Better Auth server-side session and clears both the real
 * and legacy mock session cookies.
 */
export async function POST(request: NextRequest) {
  try {
    // Revoke the server-side session (best effort).
    try {
      await auth.api.signOut({ headers: request.headers });
    } catch {
      /* session may already be gone — cookie clearing below still applies */
    }

    const cookieStore = await cookies();
    for (const name of [SESSION_COOKIE, MOCK_COOKIE]) {
      cookieStore.set(name, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }

    return Response.json({ success: true, message: "Signed out" });
  } catch {
    return Response.json({ success: false, error: "Sign out failed" }, { status: 500 });
  }
}
