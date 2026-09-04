import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/get-session";
import { handleApiError, ValidationError, RateLimitError } from "@/lib/errors/api-errors";
import { runProfileReview } from "@/lib/profile-review/service";
import { parseProfileContent } from "@/lib/profile-review/parse-content";
import { checkProfileReviewLimit } from "@/lib/profile-review/limits";
import { storeAnalysis } from "@/lib/profile-review/storage";
import { trackEvent } from "@/lib/monitoring/analytics";

const analyzeContentSchema = z.object({
  content: z.string().min(20, "Please paste at least a few sentences of your profile."),
  profileUrl: z.string().optional(),
});

/**
 * POST /api/tools/linkedin-profile-review/analyze-content
 *
 * Alternative flow: user pastes their profile content (no scraping — ever).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request as any);
    const userId = session?.user?.id || null;

    let body: z.infer<typeof analyzeContentSchema>;
    try {
      body = analyzeContentSchema.parse(await request.json());
    } catch {
      throw new ValidationError("Please paste at least a few sentences of your profile.");
    }

    const limit = checkProfileReviewLimit(request, userId);
    if (!limit.allowed) {
      throw new RateLimitError(
        `Free limit reached: ${limit.limit} analyses per ${limit.kind === "anonymous" ? "day" : "month"}. Try again later or create a free account.`
      );
    }

    const profileData = parseProfileContent(body.content);

    // URL is optional here; normalize if given
    let profileUrl: string | null = null;
    let username: string | null = null;
    if (body.profileUrl) {
      try {
        const { parseLinkedInProfileUrl } = await import("@/lib/profile-review/url-parser");
        const parsed = parseLinkedInProfileUrl(body.profileUrl);
        profileUrl = parsed.profileUrl;
        username = parsed.username;
      } catch {
        // Non-fatal: keep analyzing the content
      }
    }

    trackEvent({ event: "profile_review_started", source: "content" });

    const result = await runProfileReview(profileData, {
      profileUrl,
      username,
      source: "manual",
      partial: false,
    });

    let analysisId: string | null = null;
    if (userId) analysisId = await storeAnalysis(userId, { ...result, analysisId });

    trackEvent({
      event: "profile_review_completed",
      usedAi: result.usedAi,
      overallScore: result.overallScore,
    });

    return Response.json({
      success: true,
      status: "completed",
      analysisId,
      remaining: limit.remaining,
      result: { ...result, analysisId },
    });
  } catch (error) {
    return handleApiError(error);
  }
}