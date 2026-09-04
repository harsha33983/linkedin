/**
 * LinkedInOfficialProvider
 *
 * Uses ONLY LinkedIn-approved APIs available to this application:
 * the OpenID Connect userinfo endpoint (`/v2/userinfo`) accessible with
 * the connected account's access token during the OAuth flow.
 *
 * The application's LinkedIn app is approved for OpenID profile (name,
 * picture) and w_member_social (publishing). It is NOT approved for
 * r_liteprofile / r_member_social, so headline, About, and experience are
 * honestly reported as unavailable rather than scraped or fabricated.
 */

import { sql } from "@/lib/db";
import { decryptAccessToken } from "@/lib/encryption/tokens";
import type { ProfileDataProvider, ProfileDataContext } from "./types";
import type { ProfileDataResult, RawProfileData } from "../types";

export class LinkedInOfficialProvider implements ProfileDataProvider {
  readonly name = "linkedin-official";

  async getProfileByUrl(profileUrl: string, ctx: ProfileDataContext): Promise<ProfileDataResult> {
    if (!ctx.userId) {
      return {
        ok: false,
        data: null,
        error: "Sign in and connect LinkedIn to use the official provider.",
        unavailableFields: ["name", "headline", "about", "experience", "education", "skills"],
      };
    }

    const [account] = await sql`
      SELECT "accessTokenEncrypted", "tokenIv", "displayName", "providerAccountId"
      FROM social_accounts
      WHERE "userId" = ${ctx.userId} AND provider = 'LINKEDIN' AND status = 'CONNECTED'
      LIMIT 1
    `;

    if (!account) {
      return {
        ok: false,
        data: null,
        error: "No connected LinkedIn account found.",
        unavailableFields: ["name", "headline", "about", "experience", "education", "skills"],
      };
    }

    let token: string;
    try {
      token = decryptAccessToken(account.accessTokenEncrypted, account.tokenIv);
    } catch {
      return { ok: false, data: null, error: "Could not decrypt the stored LinkedIn token." };
    }

    // OpenID userinfo — the approved identity endpoint for this app.
    let userinfo: { sub?: string; name?: string; picture?: string } | null = null;
    try {
      const res = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return {
          ok: false,
          data: null,
          error: `LinkedIn userinfo returned HTTP ${res.status}.`,
          unavailableFields: ["name", "headline", "about", "experience", "education", "skills"],
        };
      }
      userinfo = (await res.json()) as { sub?: string; name?: string; picture?: string };
    } catch (err) {
      return {
        ok: false,
        data: null,
        error: err instanceof Error ? "LinkedIn API unavailable." : "Unknown retrieval error.",
        unavailableFields: ["name", "headline", "about", "experience", "education", "skills"],
      };
    }

    // Even with userinfo, we cannot confirm the URL belongs to this member,
    // and r_liteprofile (headline/about) is not approved for this app.
    // Return only what the approved API legitimately provides.
    const data: RawProfileData = {
      profileUrl,
      name: userinfo?.name || account.displayName || null,
      headline: null,
      location: null,
      profilePhoto: userinfo?.picture || null,
      about: null,
      currentPosition: null,
      experience: [],
      education: [],
      skills: [],
      certifications: [],
      languages: [],
      projects: [],
      volunteering: [],
      recommendations: [],
      creatorInfo: { memberId: userinfo?.sub || null },
      publicMetrics: null,
      source: "linkedin-official",
      retrievedAt: new Date().toISOString(),
    };

    return {
      ok: true,
      data,
      unavailableFields: ["headline", "about", "experience", "education", "skills"],
    };
  }
}