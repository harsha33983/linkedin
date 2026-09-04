import { NextRequest } from "next/server";
import { PDFParse } from "pdf-parse";
import { getSessionFromRequest } from "@/lib/auth/get-session";
import { handleApiError, ValidationError, RateLimitError } from "@/lib/errors/api-errors";
import { runProfileReview } from "@/lib/profile-review/service";
import { parseProfileContent } from "@/lib/profile-review/parse-content";
import { checkProfileReviewLimit } from "@/lib/profile-review/limits";
import { storeAnalysis } from "@/lib/profile-review/storage";
import { trackEvent } from "@/lib/monitoring/analytics";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/tools/linkedin-profile-review/upload-pdf
 *
 * Alternative flow: user uploads their LinkedIn profile PDF (exported from
 * LinkedIn). Text is extracted server-side and analyzed. The PDF is never
 * stored and the raw text is only used for the analysis.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request as any);
    const userId = session?.user?.id || null;

    const limit = checkProfileReviewLimit(request, userId);
    if (!limit.allowed) {
      throw new RateLimitError(
        `Free limit reached: ${limit.limit} analyses per ${limit.kind === "anonymous" ? "day" : "month"}. Try again later or create a free account.`
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ValidationError("Could not read the uploaded file.");
    }

    const file = form.get("file");
    const profileUrl = String(form.get("profileUrl") || "").trim();

    if (!(file instanceof File)) {
      throw new ValidationError("Please attach a PDF file.");
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      throw new ValidationError("Only PDF files are supported.");
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new ValidationError("File is too large (max 10 MB).");
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let text: string;
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy().catch(() => {});
      text = result.text || "";
    } catch {
      throw new ValidationError("Could not read this PDF. Please paste your profile content instead.");
    }

    if (text.trim().length < 20) {
      throw new ValidationError("No readable text found in this PDF. Please paste your profile content instead.");
    }

    // Normalize URL if provided (non-fatal on failure)
    let normalizedUrl: string | null = null;
    let username: string | null = null;
    if (profileUrl) {
      try {
        const { parseLinkedInProfileUrl } = await import("@/lib/profile-review/url-parser");
        const parsed = parseLinkedInProfileUrl(profileUrl);
        normalizedUrl = parsed.profileUrl;
        username = parsed.username;
      } catch {
        // Non-fatal
      }
    }

    trackEvent({ event: "profile_review_started", source: "content" });

    const profileData = parseProfileContent(text);
    const result = await runProfileReview(profileData, {
      profileUrl: normalizedUrl,
      username,
      source: "pdf",
      partial: false,
    });

    let analysisId: string | null = null;
    if (userId) analysisId = await storeAnalysis(userId, { ...result, analysisId });

    trackEvent({ event: "profile_review_completed", usedAi: result.usedAi, overallScore: result.overallScore });

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