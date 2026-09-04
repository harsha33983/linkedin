/**
 * POST /api/queue/:id/publish-now — Immediately publish a queued post
 *
 * Validates ownership, runs content safety, publishes via LinkedIn API.
 */

import { NextRequest } from "next/server";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { publishTextPost } from "@/lib/linkedin/publishing";
import { handleApiError, NotFoundError, ValidationError } from "@/lib/errors/api-errors";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireAuthFromRequest(request);
    const { id } = params;

    // Content is read from DB by publishTextPost
    const result = await publishTextPost({
      postId: id,
      userId,
      request,
    });

    if (result.success) {
      return Response.json({
        success: true,
        message: `Published successfully! LinkedIn post ID: ${result.externalPostId}`,
        data: { externalPostId: result.externalPostId },
      });
    }

    return Response.json(
      {
        success: false,
        error: result.error,
        errorType: result.errorType,
      },
      { status: result.httpStatus || 400 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
