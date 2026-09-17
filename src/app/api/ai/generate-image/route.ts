import { NextRequest } from "next/server";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { fetchPostImage } from "@/lib/ai/image-fetch";
import { z } from "zod";

const generateImageSchema = z.object({
  query: z.string().min(1, "Query is required").max(200),
});

/**
 * POST /api/ai/generate-image — Generate (or regenerate) a cover image
 *
 * Body: { "query": "topic or image query" }
 * Response: { "success": true, "url": "https://..." }
 *
 * Used by the post generator's "New image" button — the client replaces the
 * version's current cover with the fresh URL returned here.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuthFromRequest(request as any);
    const body = await request.json();
    const parsed = generateImageSchema.parse(body);

    // Sample a random results page so "New image" returns a different photo
    // than the one already attached to the post.
    const page = Math.floor(Math.random() * 4) + 1;
    const url = await fetchPostImage(parsed.query, page);

    if (!url) {
      return Response.json(
        { success: false, error: "Could not generate an image right now. Try again in a moment." },
        { status: 502 }
      );
    }

    return Response.json({ success: true, url });
  } catch (error) {
    return handleApiError(error);
  }
}