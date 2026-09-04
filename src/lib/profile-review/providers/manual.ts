/**
 * ManualProfileProvider
 *
 * Uses profile content supplied by the user (paste / PDF / structured
 * form). Nothing is retrieved from the network — the user is the source.
 */

import type { ProfileDataProvider, ProfileDataContext } from "./types";
import type { ProfileDataResult, RawProfileData } from "../types";

export interface ManualProfileInput {
  profileUrl: string;
  name?: string | null;
  headline?: string | null;
  about?: string | null;
  experience?: string | null;
  education?: string | null;
  skills?: string[] | string | null;
}

export class ManualProfileProvider implements ProfileDataProvider {
  readonly name = "manual";

  getProfileByUrl(profileUrl: string, _ctx: ProfileDataContext, input?: ManualProfileInput): Promise<ProfileDataResult> {
    if (!input) {
      return Promise.resolve({
        ok: false,
        data: null,
        error: "No profile content supplied.",
      });
    }

    const data: RawProfileData = {
      profileUrl,
      name: input.name || null,
      headline: input.headline || null,
      location: null,
      profilePhoto: null,
      about: input.about || null,
      currentPosition: null,
      experience: [],
      education: [],
      skills: Array.isArray(input.skills)
        ? input.skills.map((s) => String(s).trim()).filter(Boolean)
        : String(input.skills || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
      certifications: [],
      languages: [],
      projects: [],
      volunteering: [],
      recommendations: [],
      creatorInfo: null,
      publicMetrics: null,
      source: "manual",
      retrievedAt: new Date().toISOString(),
    };

    // Fold free-form experience/education text into the structured items.
    if (input.experience && input.experience.trim()) {
      const lines = input.experience.split("\n").map((l) => l.trim()).filter(Boolean);
      const bullets = lines.filter((l) => /^[-•*▪]/.test(l) || /^\d+[.)]/.test(l));
      const header = lines.find((l) => !/^[-•*▪]/.test(l) && !/^\d+[.)]/.test(l)) || null;
      const [role, company] = header ? splitRoleCompany(header) : [null, null];
      data.experience = [
        {
          company,
          role,
          startDate: null,
          endDate: null,
          duration: null,
          location: null,
          description: bullets.length ? bullets.join("\n") : header,
          bullets,
        },
      ];
    }
    if (input.education && input.education.trim()) {
      data.education = [{ school: input.education.trim(), degree: null, field: null, startDate: null, endDate: null, description: null }];
    }

    return Promise.resolve({ ok: true, data });
  }
}

function splitRoleCompany(header: string): [string | null, string | null] {
  const match = header.match(/^(.+?)\s+(?:at|@|—|–|-)\s+(.+)$/);
  if (match) return [match[1].trim(), match[2].trim()];
  return [header, null];
}