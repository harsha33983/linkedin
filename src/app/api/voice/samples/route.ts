import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, ValidationError } from "@/lib/errors/api-errors";
import { getSourceWeight } from "@/lib/voice/weighting";
import { dispatchVoiceReanalysis } from "@/lib/queue";
import { z } from "zod";

const createSampleSchema = z.object({
  content: z.string().min(10, "Sample must be at least 10 characters"),
  source: z.enum(["linkedin_post", "blog", "email", "slack", "other"]).default("other"),
  sourceType: z.string().optional(),
});

/**
 * GET /api/voice/samples — List all writing samples
 */
export async function GET(request: any) {
  try {
    const userId = await requireAuthFromRequest(request as any);

    const samples = await sql`SELECT * FROM writing_samples WHERE "userId" = ${userId} ORDER BY "createdAt" DESC`;

    return Response.json({
      success: true,
      data: samples,
      total: samples.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/voice/samples — Add a writing sample
 *
 * After adding, triggers automatic Voice DNA reanalysis if >= 3 samples.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const parsed = createSampleSchema.parse(body);

    // Check sample cap (free tier: 10, creator: 50)
    const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM writing_samples WHERE "userId" = ${userId}`;
    const sampleCount = count;

    // TODO: Check user plan for cap
    const maxSamples = 50; // Default cap
    if (sampleCount >= maxSamples) {
      throw new ValidationError(
        `Sample cap reached (${maxSamples}). Remove existing samples or upgrade your plan.`
      );
    }

    // Create sample with computed weight
    const weight = getSourceWeight(parsed.source);

    const [sample] = await sql`
      INSERT INTO writing_samples (
        id, "userId", content, source, "sourceType", weight, "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, ${parsed.content}, ${parsed.source}, 
        ${parsed.sourceType || parsed.source}, ${weight}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;

    // Trigger reanalysis if we have >= 3 samples
    if (sampleCount + 1 >= 3) {
      dispatchVoiceReanalysis({
        userId,
        triggerReason: "sample_added",
      });
    }

    return Response.json(
      {
        success: true,
        data: sample,
        message:
          sampleCount + 1 < 3
            ? `Added! ${3 - (sampleCount + 1)} more samples needed for Voice DNA.`
            : "Added! Voice DNA will be reanalyzed in the background.",
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
