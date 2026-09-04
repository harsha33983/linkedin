/**
 * ProfileDataService
 *
 * Chooses the configured ProfileDataProvider and owns the retrieval
 * pipeline: cache → provider → validation → normalization.
 *
 * Provider selection (PROFILE_DATA_PROVIDER):
 *   "auto"         → apify if configured, else proxycurl if configured, else
 *                    third-party if configured, else official (needs auth)
 *   "official"     → LinkedIn approved APIs only
 *   "apify"        → Apify LinkedIn-profile Actor (requires APIFY_API_TOKEN +
 *                    APIFY_LINKEDIN_PROFILE_ACTOR)
 *   "proxycurl"    → Proxycurl LinkedIn Profile API (requires PROXYCURL_API_KEY)
 *   "third_party"  → authorized REST provider (requires PROFILE_DATA_API_*)
 *   "manual"       → user-supplied content only
 *   "none"         → no retrieval; the caller must supply content
 *
 * Caching: short, configurable, in-memory TTL (default 24h) keyed by
 * canonical URL. Provider terms and applicable law govern how long data
 * may be retained; the cache stores `retrievedAt` + `source` so staleness
 * is always visible.
 */

import type { ProfileDataProvider, ProfileDataContext } from "./types";
import type { NormalizedProfileData, ProfileDataResult } from "../types";
import { LinkedInOfficialProvider } from "./linkedin-official";
import { ThirdPartyProfileProvider } from "./third-party";
import { ProxycurlProfileProvider } from "./proxycurl";
import { ApifyLinkedInProfileProvider } from "./apify";
import { ManualProfileProvider, type ManualProfileInput } from "./manual";

export type { ProfileDataProvider, ProfileDataContext, ProfileDataResult };
export { ManualProfileProvider, LinkedInOfficialProvider, ThirdPartyProfileProvider, ProxycurlProfileProvider, ApifyLinkedInProfileProvider };
export type { ManualProfileInput } from "./manual";

interface CacheEntry {
  data: NormalizedProfileData;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 200;

function cacheTtlMs(): number {
  const raw = process.env.PROFILE_REVIEW_CACHE_TTL_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24 * 60 * 60 * 1000;
}

export function resolveProvider(): ProfileDataProvider | null {
  const mode = (process.env.PROFILE_DATA_PROVIDER || "auto").toLowerCase();

  switch (mode) {
    case "official":
      return new LinkedInOfficialProvider();
    case "apify":
      return new ApifyLinkedInProfileProvider();
    case "proxycurl":
      return new ProxycurlProfileProvider();
    case "third_party":
    case "third-party":
      return new ThirdPartyProfileProvider();
    case "manual":
      return new ManualProfileProvider();
    case "none":
      return null;
    case "auto":
    default: {
      if (process.env.APIFY_API_TOKEN && process.env.APIFY_LINKEDIN_PROFILE_ACTOR) {
        return new ApifyLinkedInProfileProvider();
      }
      if (process.env.PROXYCURL_API_KEY) {
        return new ProxycurlProfileProvider();
      }
      if (process.env.PROFILE_DATA_API_URL && process.env.PROFILE_DATA_API_KEY) {
        return new ThirdPartyProfileProvider();
      }
      return new LinkedInOfficialProvider();
    }
  }
}

/** Validate + normalize provider output into the pipeline shape. */
export function normalizeProviderData(
  profileUrl: string,
  raw: ProfileDataResult,
  unavailableFields: string[] = []
): NormalizedProfileData {
  const d = raw.data!;
  const knownFields = [
    "name", "headline", "location", "profilePhoto", "about", "currentPosition",
    "experience", "education", "skills", "certifications", "languages",
    "projects", "volunteering", "recommendations", "creatorInfo", "publicMetrics",
  ];
  const missingFields = knownFields.filter((f) => {
    const v = (d as unknown as Record<string, unknown>)[f];
    return v === null || v === undefined || (Array.isArray(v) && v.length === 0);
  });

  return {
    profileUrl,
    name: d.name || null,
    headline: d.headline || null,
    location: d.location || null,
    profilePhoto: d.profilePhoto || null,
    about: d.about || null,
    currentPosition: d.currentPosition || null,
    experience: Array.isArray(d.experience) ? d.experience : [],
    education: Array.isArray(d.education) ? d.education : [],
    skills: Array.isArray(d.skills) ? dedupe(d.skills.map((s) => String(s).trim()).filter(Boolean)) : [],
    certifications: Array.isArray(d.certifications) ? dedupe(d.certifications.map((s) => String(s).trim()).filter(Boolean)) : [],
    languages: Array.isArray(d.languages) ? dedupe(d.languages.map((s) => String(s).trim()).filter(Boolean)) : [],
    projects: Array.isArray(d.projects) ? dedupe(d.projects.map((s) => String(s).trim()).filter(Boolean)) : [],
    volunteering: Array.isArray(d.volunteering) ? dedupe(d.volunteering.map((s) => String(s).trim()).filter(Boolean)) : [],
    recommendations: Array.isArray(d.recommendations) ? dedupe(d.recommendations.map((s) => String(s).trim()).filter(Boolean)) : [],
    creatorInfo: d.creatorInfo || null,
    publicMetrics: d.publicMetrics || null,
    source: d.source || "unknown",
    retrievedAt: d.retrievedAt || new Date().toISOString(),
    partial: missingFields.length > 0 || unavailableFields.length > 0,
    missingFields: Array.from(new Set([...missingFields, ...unavailableFields])),
  };
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

/** Core indicator of whether a retrieved profile has enough data to analyze. */
export function hasEnoughData(data: NormalizedProfileData | null): boolean {
  if (!data) return false;
  const hasText =
    (data.headline || "").trim().length > 0 ||
    (data.about || "").trim().length > 0 ||
    data.experience.length > 0 ||
    data.skills.length > 0;
  return hasText;
}

export class ProfileDataService {
  private provider: ProfileDataProvider | null;
  private manual: ManualProfileProvider;

  constructor() {
    this.provider = resolveProvider();
    this.manual = new ManualProfileProvider();
  }

  get providerName(): string | null {
    return this.provider?.name || null;
  }

  /**
   * Retrieve a public profile. Returns the normalized profile or null.
   * Never fabricates data: when retrieval is impossible, error explains why.
   */
  async getProfileByUrl(
    profileUrl: string,
    ctx: ProfileDataContext,
    manualInput?: ManualProfileInput
  ): Promise<{ data: NormalizedProfileData | null; error?: string }> {
    // Manual content bypasses cache (user-supplied).
    if (manualInput || this.provider?.name === "manual") {
      const res = await this.manual.getProfileByUrl(profileUrl, ctx, manualInput);
      if (!res.ok || !res.data) return { data: null, error: res.error };
      const normalized = normalizeProviderData(profileUrl, res);
      return { data: normalized };
    }

    // Cache lookup (public data only)
    const cached = cache.get(profileUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return { data: cached.data };
    }

    if (!this.provider) {
      return { data: null, error: "No profile data provider is configured." };
    }

    const res = await this.provider.getProfileByUrl(profileUrl, ctx);
    if (!res.ok || !res.data) {
      return { data: null, error: res.error || "Could not retrieve profile data." };
    }

    const normalized = normalizeProviderData(profileUrl, res, res.unavailableFields);

    // Cache only when legally permitted (short TTL; source + retrievedAt stored)
    cache.set(profileUrl, { data: normalized, expiresAt: Date.now() + cacheTtlMs() });
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest) cache.delete(oldest);
    }

    return { data: normalized };
  }

  /** Clear the cache (used in tests). */
  clearCache(): void {
    cache.clear();
  }
}

export const profileDataService = new ProfileDataService();