import { NextRequest } from "next/server";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, NotFoundError } from "@/lib/errors/api-errors";
import { publishTextPost } from "@/lib/linkedin/publishing";

/**
 * POST /api/posts/[id]/publish — Manual immediate publish
 *
 * Bypasses the queue — publishes immediately via LinkedIn Posts API.
 * Uses the same working publishTextPost service as the queue publish-now route.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireAuthFromRequest(request);
    const { id } = params;

    // publishTextPost validates the post exists, checks LinkedIn connection,
    // decrypts token, runs safety checks, and publishes via Posts API
    const result = await publishTextPost({
      postId: id,
      userId,
      request,
    });

    if (result.success) {
      return Response.json({
        success: true,
        data: {
          published: true,
          postId: result.externalPostId,
        },
        message: `Published to LinkedIn! Post ID: ${result.externalPostId}`,
      });
    }

    // Publish failed
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
