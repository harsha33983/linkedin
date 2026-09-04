/**
 * ProxycurlProfileProvider
 *
 * Legitimate third-party retrieval via Proxycurl's LinkedIn Profile API
 * (https://nubela.co/proxycurl/docs#linkedin-profile-api). Proxycurl is an
 * authorized data provider that owns the process of collecting the data it
 * serves, so this adapter never touches LinkedIn directly and never needs
 * login cookies, CAPTCHA bypass, or browser automation.
 *
 * Credentials stay server-side:
 *   PROXYCURL_API_KEY=...        (Authorization: Bearer)
 *   PROXYCURL_API_URL=...        (optional override, defaults to the v2 endpoint)
 *
 * Mapping is defensive: Proxycurl schema varies between account tiers and
 * over time, so every field is coerced and unknown shapes become null / [].
 * Nothing is ever invented.
 */

import type { ProfileDataProvider, ProfileDataContext } from "./types";
import type { ProfileDataResult, RawProfileData } from "../types";

const DEFAULT_PROXYCURL_URL = "https://nubela.co/proxycurl/api/v2/linkedin";

type MaybeDate = { day?: number; month?: number; year?: number } | null | undefined;

interface ProxycurlExperience {
  company?: unknown;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  starts_at?: MaybeDate;
  ends_at?: MaybeDate;
  duration?: string | null;
}

interface ProxycurlEducation {
  school?: unknown;
  degree_name?: string | null;
  field_of_study?: string | null;
  starts_at?: { year?: number } | null;
  ends_at?: { year?: number } | null;
  description?: string | null;
}

interface ProxycurlAccomplishment {
  title?: string | null;
  description?: string | null;
  starts_at?: MaybeDate;
  ends_at?: MaybeDate;
  link?: string | null;
}

interface ProxycurlRecommendation {
  text?: string | null;
  author?: unknown;
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const name = obj.name;
    if (typeof name === "string" && name.trim()) return name.trim();
    const title = obj.title;
    if (typeof title === "string" && title.trim()) return title.trim();
  }
  return null;
}

function companyName(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object") {
    const name = (v as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return null;
}

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const s = item.trim();
      if (s) out.push(s);
    } else if (item && typeof item === "object") {
      const name = asString(item);
      if (name) out.push(name);
    }
  }
  return out;
}

function fmtDate(d?: MaybeDate): string | null {
  if (!d) return null;
  const parts: string[] = [];
  if (d.month) parts.push(String(d.month));
  if (d.year) parts.push(String(d.year));
  return parts.length ? parts.join("/") : null;
}

function fmtYear(d?: { year?: number } | null): string | null {
  return d && d.year ? String(d.year) : null;
}

function authorName(author: unknown): string | null {
  if (!author || typeof author !== "object") return null;
  const a = author as Record<string, unknown>;
  const first = typeof a.first_name === "string" ? a.first_name.trim() : "";
  const last = typeof a.last_name === "string" ? a.last_name.trim() : "";
  const full = `${first} ${last}`.trim();
  return full || (typeof a.name === "string" && a.name.trim() ? a.name.trim() : null);
}

function accToString(acc: ProxycurlAccomplishment): string | null {
  const title = asString(acc.title) || "";
  const desc = asString(acc.description) || "";
  if (title && desc) return `${title} — ${desc}`;
  return title || desc || null;
}

function recToString(rec: ProxycurlRecommendation): string | null {
  const text = asString(rec.text);
  const author = authorName(rec.author);
  if (text && author) return `${text} — ${author}`;
  return text || (author ? `Recommendation from ${author}` : null);
}

function volunteerToString(v: unknown): string | null {
  if (!v || typeof v !== "object") return asString(v);
  const obj = v as Record<string, unknown>;
  const title = asString(obj.title) || "";
  const org = companyName(obj.company) || "";
  const desc = asString(obj.description) || "";
  if (title && org) {
    const dates = fmtDate(obj.starts_at as MaybeDate);
    return dates ? `${title} at ${org} (${dates})` : `${title} at ${org}`;
  }
  return title || org || desc || null;
}

export class ProxycurlProfileProvider implements ProfileDataProvider {
  readonly name = "proxycurl";

  async getProfileByUrl(profileUrl: string, _ctx: ProfileDataContext): Promise<ProfileDataResult> {
    const apiKey = process.env.PROXYCURL_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        data: null,
        error: "PROXYCURL_API_KEY is not configured on the server.",
        unavailableFields: ["name", "headline", "about", "experience", "education", "skills"],
      };
    }

    const baseUrl = process.env.PROXYCURL_API_URL || DEFAULT_PROXYCURL_URL;
    const target = `${baseUrl}?url=${encodeURIComponent(profileUrl)}`;

    let json: Record<string, unknown>;
    try {
      const res = await fetch(target, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(25_000),
      });

      if (res.status === 401) {
        return { ok: false, data: null, error: "Profile provider rejected the API key (401)." };
      }
      if (res.status === 402 || res.status === 403) {
        return { ok: false, data: null, error: "Profile provider has no credits or access for this request (403)." };
      }
      if (res.status === 429) {
        return { ok: false, data: null, error: "Profile provider rate limit reached (429). Try again in a minute." };
      }
      if (!res.ok) {
        return { ok: false, data: null, error: `Profile provider returned HTTP ${res.status}.` };
      }

      json = (await res.json()) as Record<string, unknown>;
    } catch {
      return { ok: false, data: null, error: "Profile provider unreachable or timed out." };
    }

    if (json.success === false) {
      return { ok: false, data: null, error: "Profile provider could not find this profile." };
    }

    const experiences = (Array.isArray(json.experiences) ? json.experiences : []) as ProxycurlExperience[];
    const experience = experiences.map((e) => ({
      company: companyName(e.company),
      role: asString(e.title),
      startDate: fmtDate(e.starts_at),
      endDate: fmtDate(e.ends_at),
      duration: asString(e.duration),
      location: asString(e.location),
      description: asString(e.description),
      bullets: [],
    }));

    const education = (Array.isArray(json.education) ? json.education : []) as ProxycurlEducation[];
    const educationMapped = education.map((e) => ({
      school: companyName(e.school),
      degree: asString(e.degree_name),
      field: asString(e.field_of_study),
      startDate: fmtYear(e.starts_at),
      endDate: fmtYear(e.ends_at),
      description: asString(e.description),
    }));

    const city = asString(json.city);
    const country = asString(json.country_full_name) || asString(json.country);
    const location = [city, country].filter(Boolean).join(", ") || null;

    const projects: string[] = [];
    for (const acc of (Array.isArray(json.accomplishment_projects)
      ? json.accomplishment_projects
      : []) as ProxycurlAccomplishment[]) {
      const s = accToString(acc);
      if (s) projects.push(s);
    }
    const publications: string[] = [];
    for (const pub of (Array.isArray(json.accomplishment_publications)
      ? json.accomplishment_publications
      : []) as ProxycurlAccomplishment[]) {
      const s = accToString(pub);
      if (s) publications.push(s);
    }
    const allProjects = Array.from(new Set([...projects, ...publications])).slice(0, 20);

    const volunteering = (Array.isArray(json.volunteer_work) ? json.volunteer_work : [])
      .map(volunteerToString)
      .filter((s): s is string => !!s);

    const recommendations = (Array.isArray(json.recommendations) ? json.recommendations : [])
      .map((r) => recToString(r as ProxycurlRecommendation))
      .filter((s): s is string => !!s);

    const certifications = stringList(json.certifications);
    const languages = stringList(json.languages);
    const skills = stringList(json.skills);

    const profileUrlField = asString(json.linkedin_profile_url) || profileUrl;

    const data: RawProfileData = {
      profileUrl: profileUrlField,
      name: asString(json.full_name),
      headline: asString(json.headline),
      location,
      profilePhoto: asString(json.profile_pic_url),
      about: asString(json.summary),
      currentPosition: experience[0]
        ? { company: experience[0].company, role: experience[0].role }
        : null,
      experience,
      education: educationMapped,
      skills,
      certifications,
      languages,
      projects: allProjects,
      volunteering,
      recommendations,
      creatorInfo: {
        publicIdentifier: asString(json.public_identifier),
        occupation: asString(json.occupation),
        followerCount: typeof json.follower_count === "number" ? json.follower_count : null,
        connectionCount: typeof json.connection_count === "number" ? json.connection_count : null,
        memberId: asString(json.member_id) || undefined,
      },
      publicMetrics: {
        followerCount: typeof json.follower_count === "number" ? json.follower_count : null,
        connectionCount: typeof json.connection_count === "number" ? json.connection_count : null,
      },
      source: "proxycurl",
      retrievedAt: new Date().toISOString(),
    };

    return { ok: true, data };
  }
}
