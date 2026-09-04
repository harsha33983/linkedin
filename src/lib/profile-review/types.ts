/**
 * Profile Data Types
 *
 * The raw shape returned by a ProfileDataProvider, and the normalized
 * shape the analysis pipeline consumes. Providers never invent fields:
 * missing information is null / [].
 */

export interface RawExperienceItem {
  company: string | null;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
  duration: string | null;
  location: string | null;
  description: string | null;
  bullets: string[];
}

export interface RawEducationItem {
  school: string | null;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}

export interface RawProfileData {
  profileUrl: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  profilePhoto: string | null;
  about: string | null;
  currentPosition: { company: string | null; role: string | null } | null;
  experience: RawExperienceItem[];
  education: RawEducationItem[];
  skills: string[];
  certifications: string[];
  languages: string[];
  projects: string[];
  volunteering: string[];
  recommendations: string[];
  creatorInfo: Record<string, unknown> | null;
  publicMetrics: Record<string, unknown> | null;
  source: string;
  retrievedAt: string;
}

/**
 * Result of a provider call. `data` is null when retrieval failed or was
 * impossible; `error` explains why (never exposes secrets).
 */
export interface ProfileDataResult {
  ok: boolean;
  data: RawProfileData | null;
  error?: string;
  /** Fields the profile is known to have but this provider could not return. */
  unavailableFields?: string[];
}

/**
 * Normalized profile — what the analysis pipeline consumes.
 * All original text preserved; only trimmed/deduped.
 */
export interface NormalizedProfileData {
  profileUrl: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  profilePhoto: string | null;
  about: string | null;
  currentPosition: { company: string | null; role: string | null } | null;
  experience: RawExperienceItem[];
  education: RawEducationItem[];
  skills: string[];
  certifications: string[];
  languages: string[];
  projects: string[];
  volunteering: string[];
  recommendations: string[];
  creatorInfo: Record<string, unknown> | null;
  publicMetrics: Record<string, unknown> | null;
  source: string;
  retrievedAt: string;
  /** Whether some known fields were not retrievable (partial analysis). */
  partial: boolean;
  /** Which fields were unavailable. */
  missingFields: string[];
}