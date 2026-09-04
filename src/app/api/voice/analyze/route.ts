import { NextRequest } from "next/server";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { analyzeVoiceProfile } from "@/lib/voice/analyze";

/**
 * POST /api/voice/analyze — Analyze writing samples and generate/update Voice DNA
 *
 * This is the core Voice DNA generation endpoint.
 * It can be called:
 * 1. After adding samples (initial generation)
 * 2. After adding/deleting samples (reanalysis)
 * 3. On manual reanalyze request
 *
 * The actual pipeline lives in src/lib/voice/analyze.ts so the queue
 * dispatcher can reuse it for background reanalysis.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json().catch(() => ({}));
    const triggerReason = body.triggerReason || "manual_reanalyze";

    const data = await analyzeVoiceProfile(userId, triggerReason);

    return Response.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}
