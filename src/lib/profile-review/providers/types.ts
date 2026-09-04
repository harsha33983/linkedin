/**
 * ProfileDataProvider — retrieval abstraction
 *
 * The analysis pipeline never talks to a specific data source. Swap the
 * configured provider via PROFILE_DATA_PROVIDER without touching NLP/AI.
 *
 * Implementations:
 *  - LinkedInOfficialProvider  (approved LinkedIn APIs, e.g. OpenID userinfo)
 *  - ThirdPartyProfileProvider (authorized data provider via REST API)
 *  - ManualProfileProvider     (user-supplied content: paste / PDF / form)
 */

import type { ProfileDataResult, RawProfileData } from "../types";

export interface ProfileDataContext {
  /** Authenticated user id, when available. */
  userId?: string | null;
}

export interface ProfileDataProvider {
  readonly name: string;
  /**
   * Retrieve a public profile by canonical URL.
   * Return { ok: false, data: null, error } when retrieval is impossible —
   * never fabricate data.
   */
  getProfileByUrl(profileUrl: string, ctx: ProfileDataContext): Promise<ProfileDataResult>;
}

export type { RawProfileData, ProfileDataResult };