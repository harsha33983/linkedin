/**
 * GET /api/linkedin/callback — LinkedIn OAuth redirect handler
 *
 * Flow:
 * 1. Receive code + state from LinkedIn
 * 2. Validate state (CSRF protection)
 * 3. Exchange code for access token
 * 4. Retrieve LinkedIn member identity
 * 5. Encrypt and store tokens in SocialAccount
 * 6. Record audit event
 * 7. Redirect to /settings/integrations?linkedin=connected
 */

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { validateOAuthState, encrypt } from "@/lib/encryption/tokens";
import { getLinkedInProfile } from "@/lib/linkedin/publishing";
import { recordAuditEvent } from "@/lib/audit/service";

const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  const redirectBase = `${baseUrl}/settings/integrations`;

  // Handle LinkedIn error responses
  if (error) {
    const message = encodeURIComponent(errorDescription || error);
    return Response.redirect(`${redirectBase}?error=linkedin_auth_denied&message=${message}`);
  }

  if (!code || !state) {
    return Response.redirect(`${redirectBase}?error=linkedin_missing_params`);
  }

  // 1. Validate CSRF state
  const stateData = validateOAuthState(state);
  if (!stateData) {
    return Response.redirect(`${redirectBase}?error=linkedin_invalid_state`);
  }

  const { userId } = stateData;

  // 2. Exchange authorization code for tokens
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = `${baseUrl}/api/linkedin/callback`;

  if (!clientId || !clientSecret) {
    return Response.redirect(`${redirectBase}?error=linkedin_not_configured`);
  }

  try {
    const tokenResponse = await fetch(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      console.error("[LinkedIn] Token exchange failed:", tokenResponse.status);
      return Response.redirect(`${redirectBase}?error=linkedin_token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();

    // 3. Retrieve LinkedIn profile (try userinfo first, fallback to /v2/me)
    const profile = await getLinkedInProfile(tokenData.access_token);

    // 4. Encrypt tokens (AES-256-CBC)
    const { encrypted: accessTokenEncrypted, iv: tokenIv } = encrypt(tokenData.access_token);
    let refreshTokenEncrypted: string | null = null;
    let refreshIv: string | null = null;

    if (tokenData.refresh_token) {
      const refreshResult = encrypt(tokenData.refresh_token);
      refreshTokenEncrypted = refreshResult.encrypted;
      refreshIv = refreshResult.iv;
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // 5. Store SocialAccount (upsert)
    const grantedScopes = tokenData.scope?.split(' ') || ['openid', 'profile', 'email', 'w_member_social'];
    await sql`
      INSERT INTO social_accounts (
        id, "userId", provider, "accessTokenEncrypted", "tokenIv", "refreshTokenEncrypted", "refreshIv", 
        "expiresAt", "providerAccountId", "displayName", scopes, status, "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, 'LINKEDIN', ${accessTokenEncrypted}, ${tokenIv}, 
        ${refreshTokenEncrypted}, ${refreshIv}, ${expiresAt}, ${profile?.sub || null}, 
        ${profile?.name || null}, ${grantedScopes}, 'CONNECTED', CURRENT_TIMESTAMP
      )
      ON CONFLICT (provider, "userId") DO UPDATE SET
        "accessTokenEncrypted" = EXCLUDED."accessTokenEncrypted",
        "tokenIv" = EXCLUDED."tokenIv",
        "refreshTokenEncrypted" = EXCLUDED."refreshTokenEncrypted",
        "refreshIv" = EXCLUDED."refreshIv",
        "expiresAt" = EXCLUDED."expiresAt",
        "providerAccountId" = EXCLUDED."providerAccountId",
        "displayName" = EXCLUDED."displayName",
        scopes = EXCLUDED.scopes,
        status = EXCLUDED.status,
        "errorAt" = null,
        "errorMessage" = null,
        "updatedAt" = CURRENT_TIMESTAMP
    `;

    // 6. Create default publish schedule if none exists
    await sql`
      INSERT INTO publish_schedules (
        id, "userId", mode, "postingDays", "maxPerDay", "postingTimezone", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, 'manual', ARRAY[1,2,3,4,5], 1, 'UTC', CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId") DO NOTHING
    `;

    // 7. Audit event
    await recordAuditEvent({
      userId,
      action: "USER_CONNECTED_LINKEDIN",
      metadata: { provider: "LINKEDIN", displayName: profile?.name || "Unknown" },
    });

    // 8. Redirect back to integrations page
    return Response.redirect(`${redirectBase}?linkedin=connected`);
  } catch (error) {
    console.error("[LinkedIn] Callback error:", error);
    return Response.redirect(`${redirectBase}?error=linkedin_callback_error`);
  }
}
