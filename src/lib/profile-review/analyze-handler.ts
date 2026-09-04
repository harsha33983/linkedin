/**
 * Profile Review — analyze request handler (shared)
 *
 * Both public route paths delegate here so the pipeline stays identical:
 *   POST /api/tools/linkedin-profile-review/analyze
 *   POST /api/linkedin-profile/analyze
 *
 * Flow: validate URL → normalize → rate limit → retrieval via the
 * configured ProfileDataProvider (never scrapes; provider is replaceable)
 * → validate/normalize provider data → NLP + intelligence + AI +
 * deterministic scores → store (authenticated) → report.
 *
 * When retrieval is impossible the handler returns `retrieval_failed`
 * with the fallback options — it never fabricates a report.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/get-session";
import { handleApiError, ValidationError } from "@/lib/errors/api-errors";
import { parseLinkedInProfileUrl, InvalidLinkedInUrlError } from "@/lib/profile-review/url-parser";
import { runProfileReview, type ProfileReviewResult } from "@/lib/profile-review/service";
import { checkProfileReviewLimit } from "@/lib/profile-review/limits";
import { profileDataService, hasEnoughData } from "@/lib/profile-review/providers";
import { profileToAnalysisInput } from "@/lib/profile-review/normalize";
import { storeAnalysis } from "@/lib/profile-review/storage";
import { trackEvent } from "@/lib/monitoring/analytics";

const analyzeSchema = z.object({
  profileUrl: z.string().min(1, "Profile URL is required"),
  profileData: z
    .object({
      headline: z.string().optional(),
      about: z.string().optional(),
      experience: z.string().optional(),
      education: z.string().optional(),
      skills: z.array(z.string()).or(z.string()).optional(),
    })
    .optional(),
});

/**
 * Persist the analysis when possible. Storage is best-effort: a database
 * outage must never turn a completed report into a 500, so failures are
 * logged and swallowed (the caller reports `persisted: false`).
 */
async function persistAnalysis(
  userId: string | null,
  result: ProfileReviewResult
): Promise<{ analysisId: string | null; persisted: boolean }> {
  if (!userId) return { analysisId: null, persisted: false };
  try {
    const analysisId = await storeAnalysis(userId, { ...result, analysisId: null });
    return { analysisId, persisted: true };
  } catch (err) {
    console.error("[ProfileReview] Failed to persist analysis (non-fatal):", err);
    return { analysisId: null, persisted: false };
  }
}

export async function handleProfileAnalyze(request: NextRequest): Promise<Response> {
  try {
    const session = await getSessionFromRequest(request as any);
    const userId = session?.user?.id || null;

    let body: z.infer<typeof analyzeSchema>;
    try {
      body = analyzeSchema.parse(await request.json());
    } catch {
      throw new ValidationError("Please enter a valid LinkedIn profile URL.");
    }

    let parsed;
    try {
      parsed = parseLinkedInProfileUrl(body.profileUrl);
    } catch (err) {
      if (err instanceof InvalidLinkedInUrlError) throw new ValidationError(err.message);
      throw err;
    }

    const limit = checkProfileReviewLimit(request, userId);
    if (!limit.allowed) {
      return Response.json(
        {
          success: false,
          code: "RATE_LIMITED",
          error: `Free limit reached: ${limit.limit} analyses per ${limit.kind === "anonymous" ? "day" : "month"}. Try again later or create a free account.`,
        },
        { status: 429 }
      );
    }

    // Manual content supplied → skip retrieval (the user is the source)
    if (body.profileData) {
      trackEvent({ event: "profile_review_started", source: "url" });
      const result = await runProfileReview(body.profileData, {
        profileUrl: parsed.profileUrl,
        username: parsed.username,
        source: "manual",
        partial: false,
      });

      const { analysisId, persisted } = await persistAnalysis(userId, result);

      trackEvent({ event: "profile_review_completed", usedAi: result.usedAi, overallScore: result.overallScore });

      return Response.json({
        success: true,
        status: "completed",
        analysisId,
        persisted,
        remaining: limit.remaining,
        result: { ...result, analysisId, persisted },
      });
    }

    // Retrieval flow
    const { data, error } = await profileDataService.getProfileByUrl(parsed.profileUrl, { userId });

    if (!data || !hasEnoughData(data)) {
      const message = "We couldn't retrieve enough profile information to analyze this profile.";
      return Response.json({
        success: true,
        status: "retrieval_failed",
        profileUrl: parsed.profileUrl,
        username: parsed.username,
        errorDetail: error || null,
        message,
        options: ["connect_linkedin", "upload_pdf", "paste_content"],
      });
    }

    trackEvent({ event: "profile_review_started", source: "url" });

    const analysisInput = profileToAnalysisInput(data);
    const result = await runProfileReview(analysisInput, {
      profileUrl: parsed.profileUrl,
      username: parsed.username,
      source: data.source,
      retrievedAt: data.retrievedAt,
      partial: data.partial,
      missingFields: data.missingFields,
      providerData: data,
    });

    const { analysisId, persisted } = await persistAnalysis(userId, result);

    trackEvent({ event: "profile_review_completed", usedAi: result.usedAi, overallScore: result.overallScore });

    return Response.json({
      success: true,
      status: "completed",
      analysisId,
      persisted,
      remaining: limit.remaining,
      result: { ...result, analysisId, persisted },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      trackEvent({ event: "profile_review_failed", reason: "invalid_url" });
    }
    return handleApiError(error);
  }
}
