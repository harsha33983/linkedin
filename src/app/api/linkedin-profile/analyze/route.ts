import type { NextRequest } from "next/server";
import { handleProfileAnalyze } from "@/lib/profile-review/analyze-handler";

/**
 * POST /api/linkedin-profile/analyze
 *
 * Canonical entry point for the LinkedIn Profile Intelligence flow:
 *
 *   Frontend → POST /api/linkedin-profile/analyze
 *            → ProfileDataService → configured ProfileDataProvider
 *            → normalized profile → NLP → AI → scores → report
 *
 * Request:  { "profileUrl": "https://www.linkedin.com/in/username" }
 * Response: {
 *   success: true,
 *   analysisId: "...",
 *   profile:  { profileUrl, username, data, source, retrievedAt, partial, missingFields },
 *   analysis: { ...full report (score, categories, recommendations, suggestions) }
 * }
 *
 * Provider credentials never leave the server and are never returned.
 */
export async function POST(request: NextRequest) {
  const response = await handleProfileAnalyze(request);
  const json = await response.json();

  // Enrich only successful, completed analyses with the spec'd envelope.
  if (response.status === 200 && json && json.success && json.result) {
    const identity = json.result.identity ?? {};
    return Response.json(
      {
        success: true,
        analysisId: json.analysisId ?? json.result.analysisId ?? null,
        // `result` mirrors `analysis` for client compatibility.
        result: json.result,
        profile: {
          profileUrl: json.result.profileUrl ?? null,
          username: json.result.username ?? null,
          name: identity.name ?? null,
          headline: identity.headline ?? json.result.profileData?.headline ?? null,
          currentRole: identity.currentRole ?? null,
          currentCompany: identity.currentCompany ?? null,
          location: identity.location ?? null,
          data: json.result.profileData ?? null,
          source: json.result.dataSource?.source ?? null,
          retrievedAt: json.result.dataSource?.retrievedAt ?? null,
          partial: json.result.dataSource?.partial ?? false,
          missingFields: json.result.dataSource?.missingFields ?? [],
        },
        analysis: json.result,
        remaining: json.remaining ?? null,
        persisted: json.persisted ?? false,
      },
      { status: 200 }
    );
  }

  // Forward errors and the retrieval_failed fallback unchanged.
  return Response.json(json, { status: response.status });
}
