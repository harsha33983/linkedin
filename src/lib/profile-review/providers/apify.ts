/**
 * ApifyLinkedInProfileProvider
 *
 * Retrieves public profile data by running an Apify Actor synchronously
 * and reading its dataset items. The Actor runs on Apify's platform and
 * owns the process of collecting the data it serves (public profile data
 * as LinkedIn serves it to logged-out visitors) — this adapter never uses
 * login cookies, li_at tokens, CAPTCHA bypass, or browser automation.
 *
 * Credentials stay server-side (never reach the browser):
 *   APIFY_API_TOKEN=...                       Apify API token
 *   APIFY_LINKEDIN_PROFILE_ACTOR=...          Actor id — full Apify id
 *                                             (e.g. HcEUCKHXJu3SvAVnC) or
 *                                             "owner~actor-name"
 *   APIFY_API_URL=...                         Optional override (tests / self-hosted) —
 *                                             defaults to https://api.apify.com
 *
 * The actor is invoked through Apify's documented synchronous endpoint:
 *   POST /v2/acts/{actorId}/run-sync-get-dataset-items?token=...&timeout=...&maxItems=1
 * with the actor input as the JSON body. Both common input conventions are
 * sent so flat ("profiles") and nested ("profileUrls") actors both work:
 *   { "profiles": [url], "profileUrls": [url], "includeRecentActivity": true }
 *
 * Output mapping is defensive and supports the two dataset row shapes seen
 * in the wild:
 *   - flat:  { name, headline, bio, companies[], education[], ... }
 *            (e.g. logiover/linkedin-profile-scraper)
 *   - nested: { url, status, profile: { full_name, title, summary,
 *             position_groups[], educations[], skills[], ... } }
 *            (e.g. the "LinkedIn Profile Scraper" nested-schema actors)
 * Nothing is ever invented; fields the actor cannot supply are reported
 * as unavailable / missing.
 */

import type { ProfileDataProvider, ProfileDataContext } from "./types";
import type { ProfileDataResult, RawProfileData } from "../types";

const DEFAULT_APIFY_URL = "https://api.apify.com";

/* ── tiny coercers ─────────────────────────────────────────── */

function str(v: unknown): string | null {
  if (typeof v === "string") {
    const s = v.trim();
    // "--" is LinkedIn's "empty" placeholder for headline-ish fields.
    return s && s !== "--" ? s : null;
  }
  if (typeof v === "number") return String(v);
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rowObject(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const s = item.trim();
      if (s) out.push(s);
    } else {
      const o = rowObject(item);
      if (o) {
        const name = str(o.name) || str(o.title) || str(o.language) || str(o.code);
        if (name) out.push(name);
      }
    }
  }
  return out;
}

/** Grab a date-ish string from an object, trying common key spellings. */
function dateOf(obj: Record<string, unknown> | null | undefined): string | null {
  if (!obj) return null;
  for (const key of ["startDate", "start", "from", "joinedAt", "startYear", "joinedOn", "dateFrom"]) {
    const v = obj[key];
    if (v !== undefined && v !== null) {
      const inner = rowObject(v);
      const s = inner ? str(inner.year) : str(v);
      if (s) return s;
    }
  }
  return null;
}

function endDateOf(obj: Record<string, unknown> | null | undefined): string | null {
  if (!obj) return null;
  for (const key of ["endDate", "end", "to", "leftAt", "endYear", "endedOn", "dateTo"]) {
    const v = obj[key];
    if (v !== undefined && v !== null) {
      const inner = rowObject(v);
      const s = inner ? str(inner.year) : str(v);
      if (s) return s;
    }
  }
  return null;
}

function extractItems(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const obj = rowObject(body);
  if (!obj) return [];
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.data)) return obj.data;
  // Some actors return a single record object directly.
  return [body];
}

/* ── schema A: flat rows (name/headline/companies at top level) ── */

interface FlatCompanyItem {
  name?: unknown;
  url?: unknown;
  slug?: unknown;
  [key: string]: unknown;
}

function mapFlatRow(row: Record<string, unknown>, profileUrl: string): ProfileDataResult {
  const p = row;

  const companies = (Array.isArray(p.companies) ? p.companies : []) as FlatCompanyItem[];
  const jobTitles = stringList(p.jobTitles);
  const pairRoles = companies.length > 0 && jobTitles.length === companies.length;
  const currentCompany = str(p.currentCompany);

  const experience = companies.map((c, i) => {
    const co = rowObject(c) || {};
    const companyName = str(co.name) || str(co.company) || str(co.slug);
    const role = pairRoles ? jobTitles[i] || null : null;
    return {
      company: companyName || null,
      role,
      startDate: dateOf(co),
      endDate: endDateOf(co),
      duration: null,
      location: null,
      description: null,
      bullets: [],
    };
  });

  if (!experience.length && jobTitles.length) {
    jobTitles.forEach((role, i) => {
      experience.push({
        company: i === 0 ? currentCompany : null,
        role,
        startDate: null,
        endDate: null,
        duration: null,
        location: null,
        description: null,
        bullets: [],
      });
    });
  }

  const education = (Array.isArray(p.education) ? p.education : []).map((e) => {
    const ed = rowObject(e) || {};
    return {
      school: str(ed.name) || str(ed.school) || null,
      degree: str(ed.degree) || str(ed.degreeName) || str(ed.degree_name) || null,
      field: str(ed.fieldOfStudy) || str(ed.field_of_study) || null,
      startDate: dateOf(ed),
      endDate: endDateOf(ed),
      description: null,
    };
  });

  const badges = stringList(p.badges);
  const followerCount = num(p.followerCount);
  const recentActivity = (Array.isArray(p.recentActivity) ? p.recentActivity : [])
    .slice(0, 10)
    .map((a) => {
      const act = rowObject(a);
      return act
        ? {
            title: str(act.title) || str(act.headline) || null,
            url: str(act.url) || null,
            date: str(act.date) || null,
            likes: num(act.likes) ?? num(act.likeCount),
          }
        : null;
    })
    .filter((a): a is NonNullable<typeof a> => !!a && !!a.title);

  const locationParts = [str(p.location), str(p.country)].filter((s): s is string => !!s);

  const data: RawProfileData = {
    profileUrl: str(p.linkedinUrl) || profileUrl,
    name: str(p.name),
    headline: str(p.headline),
    location: locationParts.length ? locationParts.join(", ") : null,
    profilePhoto: str(p.profileImageUrl),
    about: str(p.bio) || str(p.summary),
    currentPosition:
      experience[0]?.role || currentCompany
        ? { company: experience[0]?.company || currentCompany, role: experience[0]?.role || null }
        : null,
    experience,
    education,
    skills: stringList(p.skills),
    certifications: stringList(p.certifications),
    languages: stringList(p.languages),
    projects: [],
    volunteering: [],
    recommendations: [],
    creatorInfo: {
      publicIdentifier: str(p.username),
      followerCount,
      isTopVoice: typeof p.isTopVoice === "boolean" ? p.isTopVoice : null,
      isCreator: typeof p.isCreator === "boolean" ? p.isCreator : null,
      badges,
      recentActivity: recentActivity.length ? recentActivity : undefined,
    },
    publicMetrics: {
      followerCount,
      recentPostCount: recentActivity.length || null,
    },
    source: "apify",
    retrievedAt: str(p.scrapedAt) || new Date().toISOString(),
  };

  // Flat logiover-style rows don't include these sections.
  return {
    ok: true,
    data,
    unavailableFields: ["skills", "certifications", "languages", "projects", "volunteering", "recommendations"],
  };
}

/* ── schema B: nested rows { url, status, profile: {...} } ── */

function mapNestedRow(row: Record<string, unknown>, profileUrl: string): ProfileDataResult {
  const p = rowObject(row.profile) || {};
  const actorId = process.env.APIFY_LINKEDIN_PROFILE_ACTOR || null;

  const firstName = str(p.first_name) || "";
  const lastName = str(p.last_name) || "";
  const fullName = str(p.full_name) || `${firstName} ${lastName}`.trim() || null;
  const title = str(p.title);
  const headline = str(p.headline) || title; // fall back to the position title

  // Location — short form preferred ("Hyderabad, Telangana").
  const loc = rowObject(p.location) || {};
  const location = str(loc.short) || str(loc.default);

  // Experience: position_groups → each profile_position becomes a row.
  const experience: RawProfileData["experience"] = [];
  for (const g of Array.isArray(p.position_groups) ? p.position_groups : []) {
    const group = rowObject(g);
    if (!group) continue;
    const companyObj = rowObject(group.company) || {};
    const companyName = str(companyObj.name);
    const groupDate = rowObject(group.date);
    const groupStart = dateOf(groupDate) || dateOf(group);
    const groupEnd = endDateOf(groupDate) || endDateOf(group);
    const positions = Array.isArray(group.profile_positions) ? group.profile_positions : [];
    for (const posRaw of positions) {
      const pos = rowObject(posRaw);
      if (!pos) continue;
      const posDate = rowObject(pos.date);
      const posStart = dateOf(posDate) || dateOf(pos) || groupStart;
      const posEnd = endDateOf(posDate) || endDateOf(pos) || groupEnd;
      experience.push({
        company: str(pos.company) || companyName,
        role: str(pos.title),
        startDate: posStart,
        endDate: posEnd,
        duration: null,
        location: str(pos.location),
        description: str(pos.description),
        bullets: [],
      });
    }
    // Group exists but had no parsed positions — keep the company row itself.
    if (!positions.length && companyName) {
      experience.push({
        company: companyName,
        role: null,
        startDate: groupStart,
        endDate: groupEnd,
        duration: null,
        location: null,
        description: null,
        bullets: [],
      });
    }
  }

  const education = (Array.isArray(p.educations) ? p.educations : []).map((e) => {
    const ed = rowObject(e) || {};
    const schoolObj = rowObject(ed.school) || {};
    const edDate = rowObject(ed.date);
    return {
      school: str(schoolObj.name) || str(ed.school),
      degree: str(ed.degree_name) || str(ed.degreeName) || null,
      field: str(ed.field_of_study) || str(ed.fieldOfStudy) || null,
      startDate: dateOf(edDate) || dateOf(ed),
      endDate: endDateOf(edDate) || endDateOf(ed),
      description: null,
    };
  });

  const badgesObj = rowObject(p.badges) || {};
  const badges = Object.keys(badgesObj).filter((k) => badgesObj[k] === true);
  const langs = rowObject(p.languages) || {};
  const languages = Array.isArray(langs.profile_languages) ? stringList(langs.profile_languages) : [];

  const data: RawProfileData = {
    profileUrl: (rowObject(p.links) && str(rowObject(p.links)?.linkedin)) || profileUrl,
    name: fullName,
    headline,
    location,
    profilePhoto: str(p.picture_url) || str(p.profileImageUrl),
    about: str(p.summary) || str(p.bio),
    currentPosition: experience[0]
      ? { company: experience[0].company, role: experience[0].role }
      : null,
    experience,
    education,
    skills: stringList(p.skills),
    certifications: stringList(p.certifications),
    languages,
    projects: [],
    volunteering: [],
    recommendations: [],
    creatorInfo: {
      publicIdentifier: str(p.identifier) || str(p.username),
      actor: actorId,
      industry: str(p.industry) || null,
      seniority: (rowObject(p.department) && str(rowObject(p.department)?.seniority)) || null,
      badges,
      premium: badgesObj.premium === true,
      isCreator: badgesObj.creator === true,
      isTopVoice: badgesObj.influencer === true,
    },
    publicMetrics: {},
    source: "apify",
    retrievedAt: str(p.last_updated) || new Date().toISOString(),
  };

  // Nested-schema actors can return skills/certs/languages when present,
  // so only genuinely unsupported sections are flagged.
  return {
    ok: true,
    data,
    unavailableFields: ["projects", "volunteering", "recommendations"],
  };
}

/* ── provider ──────────────────────────────────────────────── */

export class ApifyLinkedInProfileProvider implements ProfileDataProvider {
  readonly name = "apify";

  async getProfileByUrl(profileUrl: string, _ctx: ProfileDataContext): Promise<ProfileDataResult> {
    const token = process.env.APIFY_API_TOKEN;
    const actorId = process.env.APIFY_LINKEDIN_PROFILE_ACTOR;

    if (!token || !actorId) {
      return {
        ok: false,
        data: null,
        error: "Apify profile provider is not configured (APIFY_API_TOKEN / APIFY_LINKEDIN_PROFILE_ACTOR missing on the server).",
      };
    }

    const baseUrl = process.env.APIFY_API_URL || DEFAULT_APIFY_URL;
    const target =
      `${baseUrl.replace(/\/$/, "")}/v2/acts/${encodeURIComponent(actorId)}` +
      `/run-sync-get-dataset-items?token=${encodeURIComponent(token)}` +
      `&timeout=100&maxItems=1`;

    let json: unknown;
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles: [profileUrl],
          profileUrls: [profileUrl],
          includeRecentActivity: true,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (res.status === 401) {
        return { ok: false, data: null, error: "Apify rejected the API token (401). Check APIFY_API_TOKEN." };
      }
      if (res.status === 403) {
        return { ok: false, data: null, error: "Apify denied access to this Actor (403). Check APIFY_LINKEDIN_PROFILE_ACTOR permissions." };
      }
      if (res.status === 408) {
        return { ok: false, data: null, error: "The profile lookup timed out. Try again shortly." };
      }
      if (res.status === 429) {
        return { ok: false, data: null, error: "Apify rate limit reached (429). Try again in a minute." };
      }
      if (!res.ok) {
        // Surface Apify's own error message when available (never a secret).
        let detail = "";
        try {
          const errBody = (await res.json()) as { error?: { message?: string } };
          detail = errBody?.error?.message ? `: ${errBody.error.message}` : "";
        } catch {
          /* ignore unparseable error body */
        }
        return { ok: false, data: null, error: `Apify actor run failed (HTTP ${res.status})${detail}` };
      }

      json = await res.json();
    } catch {
      return { ok: false, data: null, error: "Apify profile provider unreachable or timed out." };
    }

    const items = extractItems(json);
    if (!items.length) {
      return { ok: false, data: null, error: "Apify actor returned no profile data for this URL." };
    }

    // Prefer the row matching the requested profile; else the first usable row.
    const requestedUsername = profileUrl.split("/in/")[1]?.split(/[/?#]/)[0] || "";
    const lower = requestedUsername.toLowerCase();
    const rows = items.map((i) => rowObject(i)).filter((r): r is Record<string, unknown> => !!r);
    const matches = (r: Record<string, unknown>): boolean => {
      const nested = rowObject(r.profile);
      const idStr = nested ? str(nested.identifier) || str(nested.username) : str(r.username);
      const linkStr = nested ? str(rowObject(nested.links)?.linkedin) : str(r.linkedinUrl);
      return (
        (!!idStr && idStr.toLowerCase() === lower) ||
        (!!linkStr && linkStr.toLowerCase().includes(lower))
      );
    };
    let row = rows.find(matches) || null;
    if (!row) row = rows[0];
    if (!row) {
      return { ok: false, data: null, error: "Apify actor returned an empty profile record." };
    }

    // Failed lookups come back as error rows / non-success status.
    const nestedProfile = rowObject(row.profile);
    const statusOk = !row.status || String(row.status).toLowerCase() === "success";
    if (str(row.error) || (!nestedProfile && !statusOk)) {
      return {
        ok: false,
        data: null,
        error: str(row.error) || String(row.status) || "Profile could not be retrieved.",
      };
    }

    return nestedProfile ? mapNestedRow(row, profileUrl) : mapFlatRow(row, profileUrl);
  }
}
