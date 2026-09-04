import type { NextRequest } from "next/server";
import { handleProfileAnalyze } from "@/lib/profile-review/analyze-handler";

/**
 * POST /api/tools/linkedin-profile-review/analyze
 *
 * Legacy alias of POST /api/linkedin-profile/analyze — both delegate to
 * the same handler in src/lib/profile-review/analyze-handler.ts.
 */
export async function POST(request: NextRequest) {
  return handleProfileAnalyze(request);
}
