/**
 * POST /api/dna/refresh — Refresh all DNA layers for the user
 * POST /api/dna/refresh with { postId, linkedinData } — Process LinkedIn data (learning loop)
 * GET /api/dna/refresh — Get current DNA profile status
 */

import { NextRequest } from "next/server";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { getFullDNAProfile, refreshAllDNA, processLinkedInData } from "@/lib/dna";

export async function GET(request: Request) {
  try {
    const userId = await requireAuthFromRequest(request);
    const profile = await getFullDNAProfile(userId);

    return Response.json({
      success: true,
      data: {
        combinedConfidence: profile.combinedConfidence,
        voiceConfidence: profile.voice?.confidenceScore || 0,
        performanceConfidence: profile.performance?.confidenceScore || 0,
        audienceConfidence: profile.audience?.confidenceScore || 0,
        trendFreshness: profile.trend?.freshnessScore || 0,
        performanceSamples: profile.performance?.sampleSize || 0,
        audienceSamples: profile.audience?.sampleSize || 0,
        lastUpdated: profile.lastUpdated,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json().catch(() => ({}));

    // If LinkedIn data is provided, process the learning loop
    if (body.postId && body.linkedinData) {
      await processLinkedInData(userId, body.postId, body.linkedinData);
      return Response.json({
        success: true,
        message: "LinkedIn data processed. DNA updated.",
      });
    }

    // Otherwise, refresh all DNA layers
    const profile = await refreshAllDNA(userId);

    return Response.json({
      success: true,
      data: {
        message: "All DNA layers refreshed.",
        combinedConfidence: profile.combinedConfidence,
        voice: profile.voice ? "✓" : "✗",
        performance: profile.performance?.sampleSize || 0,
        audience: profile.audience?.sampleSize || 0,
        trend: profile.trend?.activeTrends?.length || 0,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
