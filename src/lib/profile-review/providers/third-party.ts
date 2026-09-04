/**
 * ThirdPartyProfileProvider
 *
 * Generic adapter for a legitimate, authorized profile-data provider
 * (e.g. Proxycurl or similar). The endpoint and API key come from
 * environment variables and NEVER reach the frontend:
 *
 *   PROFILE_DATA_API_URL  — REST endpoint accepting the profile URL
 *   PROFILE_DATA_API_KEY  — provider credentials (server-side only)
 *
 * Expected response shape (loosely Proxycurl-compatible). Unknown fields
 * are mapped to null / [] — nothing is invented. Response text is capped
 * defensively.
 */

import type { ProfileDataProvider, ProfileDataContext } from "./types";
import type { ProfileDataResult, RawProfileData } from "../types";

interface ThirdPartyResponse {
  profileUrl?: string;
  full_name?: string | null;
  headline?: string | null;
  location?: string | null;
  profile_pic_url?: string | null;
  summary?: string | null;
  experiences?: Array<{
    company?: string | null;
    title?: string | null;
    starts_at?: { month?: number; year?: number } | null;
    ends_at?: { month?: number; year?: number } | null;
    location?: string | null;
    description?: string | null;
  }>;
  education?: Array<{
    school?: string | null;
    degree_name?: string | null;
    field_of_study?: string | null;
    starts_at?: { year?: number } | null;
    ends_at?: { year?: number } | null;
    description?: string | null;
  }>;
  skills?: string[];
  certifications?: string[];
  languages?: string[];
  projects?: string[];
  volunteer_work?: string[];
  recommendations?: string[];
  [key: string]: unknown;
}

export class ThirdPartyProfileProvider implements ProfileDataProvider {
  readonly name = "third-party";

  async getProfileByUrl(profileUrl: string, _ctx: ProfileDataContext): Promise<ProfileDataResult> {
    const apiUrl = process.env.PROFILE_DATA_API_URL;
    const apiKey = process.env.PROFILE_DATA_API_KEY;

    if (!apiUrl || !apiKey) {
      return {
        ok: false,
        data: null,
        error: "Third-party profile provider is not configured.",
      };
    }

    let raw: string;
    try {
      const target = apiUrl.includes("{url}") ? apiUrl.replace("{url}", encodeURIComponent(profileUrl)) : apiUrl;
      const res = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ url: profileUrl }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return {
          ok: false,
          data: null,
          error: `Profile provider returned HTTP ${res.status}.`,
        };
      }
      raw = (await res.text()).slice(0, 500_000);
    } catch {
      return { ok: false, data: null, error: "Profile provider unreachable." };
    }

    let json: ThirdPartyResponse;
    try {
      json = JSON.parse(raw) as ThirdPartyResponse;
    } catch {
      return { ok: false, data: null, error: "Profile provider returned invalid data." };
    }

    const fmtDate = (d?: { month?: number; year?: number } | null): string | null => {
      if (!d) return null;
      const parts: string[] = [];
      if (d.month) parts.push(String(d.month));
      if (d.year) parts.push(String(d.year));
      return parts.length ? parts.join("/") : null;
    };

    const experience = (json.experiences || []).map((e) => ({
      company: e.company || null,
      role: e.title || null,
      startDate: fmtDate(e.starts_at),
      endDate: fmtDate(e.ends_at),
      duration: null,
      location: e.location || null,
      description: e.description || null,
      bullets: [],
    }));

    const education = (json.education || []).map((e) => ({
      school: e.school || null,
      degree: e.degree_name || null,
      field: e.field_of_study || null,
      startDate: e.starts_at?.year ? String(e.starts_at.year) : null,
      endDate: e.ends_at?.year ? String(e.ends_at.year) : null,
      description: e.description || null,
    }));

    const data: RawProfileData = {
      profileUrl: json.profileUrl || profileUrl,
      name: json.full_name || null,
      headline: json.headline || null,
      location: json.location || null,
      profilePhoto: json.profile_pic_url || null,
      about: json.summary || null,
      currentPosition: experience[0]
        ? { company: experience[0].company, role: experience[0].role }
        : null,
      experience,
      education,
      skills: (json.skills || []).map((s) => String(s).trim()).filter(Boolean),
      certifications: (json.certifications || []).map((s) => String(s).trim()).filter(Boolean),
      languages: (json.languages || []).map((s) => String(s).trim()).filter(Boolean),
      projects: (json.projects || []).map((s) => String(s).trim()).filter(Boolean),
      volunteering: (json.volunteer_work || []).map((s) => String(s).trim()).filter(Boolean),
      recommendations: (json.recommendations || []).map((s) => String(s).trim()).filter(Boolean),
      creatorInfo: null,
      publicMetrics: null,
      source: "third-party",
      retrievedAt: new Date().toISOString(),
    };

    return { ok: true, data };
  }
}