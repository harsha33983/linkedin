/**
 * GET /api/linkedin/connect — Initiate LinkedIn OAuth flow
 *
 * Generates secure CSRF state and redirects to LinkedIn authorization.
 * Scopes: openid profile w_member_social
 */

import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { generateOAuthState } from "@/lib/encryption/tokens";
import { handleApiError } from "@/lib/errors/api-errors";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthFromRequest(request);

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const redirectUri = `${baseUrl}/api/linkedin/callback`;

    if (!clientId) {
      return Response.json(
        { success: false, error: "LinkedIn OAuth not configured" },
        { status: 503 }
      );
    }

    // Optional same-origin path to return to after the OAuth round-trip
    // (e.g. "/onboarding" when connecting straight from the DNA questionnaire).
    const returnTo = new URL(request.url).searchParams.get("returnTo") || undefined;

    // Generate secure CSRF state (returnTo is embedded and sanitized server-side)
    const state = generateOAuthState(userId, returnTo);

    // OpenID Connect scopes: openid (required for OIDC), profile (name), email
    // w_member_social: required for publishing posts
    const scopes = ["openid", "profile", "email", "w_member_social"];

    const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", scopes.join(" "));
    authUrl.searchParams.set("state", state);

    return Response.json({
      success: true,
      data: { authUrl: authUrl.toString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
