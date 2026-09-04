import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { seedVoiceDnaFromOnboarding } from "@/lib/voice/onboarding-dna";
import { z } from "zod";

const onboardingStepSchema = z.object({
  step: z.number().min(1).max(5),
  data: z.record(z.unknown()),
});

/** Determine whether the user has meaningfully completed onboarding. */
async function getOnboardingStatus(userId: string) {
  const [profile] = await sql`
    SELECT preferences FROM user_profiles WHERE "userId" = ${userId} LIMIT 1
  `;
  const [voice] = await sql`
    SELECT 1 AS found FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1
  `;
  const [post] = await sql`
    SELECT 1 AS found FROM posts WHERE "userId" = ${userId} LIMIT 1
  `;

  return {
    hasProfile: !!profile,
    // Step 5 (sliders) writes preferences, so a row with preferences set is
    // the strongest "finished the questionnaire" signal.
    profileCompleted: !!profile && profile.preferences != null,
    voiceDnaExists: !!voice,
    hasContent: !!post,
  };
}

/**
 * POST /api/account/onboarding — Save an onboarding step
 *
 * PRD §8.2: Data is versioned (store history via OnboardingSnapshot)
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const { step, data } = onboardingStepSchema.parse(body);

    // Save snapshot
    await sql`
      INSERT INTO onboarding_snapshots (id, "userId", step, data)
      VALUES (gen_random_uuid(), ${userId}, ${step}, ${JSON.stringify(data)}::jsonb)
    `;

    let voiceDnaCreated = false;

    switch (step) {
      case 1:
        await sql`
          INSERT INTO user_profiles (id, "userId", occupation) 
          VALUES (gen_random_uuid(), ${userId}, ${data.occupation as string})
          ON CONFLICT ("userId") DO UPDATE SET occupation = EXCLUDED.occupation
        `;
        break;
      case 2:
        // NOTE: the column is text[] — pass the array directly, do NOT ::jsonb cast
        await sql`
          INSERT INTO user_profiles (id, "userId", expertise) 
          VALUES (gen_random_uuid(), ${userId}, ${(data.expertise as string[]) || []})
          ON CONFLICT ("userId") DO UPDATE SET expertise = EXCLUDED.expertise
        `;
        break;
      case 3:
        await sql`
          INSERT INTO user_profiles (id, "userId", "targetAudience") 
          VALUES (gen_random_uuid(), ${userId}, ${(data.targetAudience as string[]) || []})
          ON CONFLICT ("userId") DO UPDATE SET "targetAudience" = EXCLUDED."targetAudience"
        `;
        break;
      case 4:
        await sql`
          INSERT INTO user_profiles (id, "userId", "linkedinGoals") 
          VALUES (gen_random_uuid(), ${userId}, ${(data.linkedinGoals as string[]) || []})
          ON CONFLICT ("userId") DO UPDATE SET "linkedinGoals" = EXCLUDED."linkedinGoals"
        `;
        break;
      case 5: {
        await sql`
          INSERT INTO user_profiles (id, "userId", preferences) 
          VALUES (gen_random_uuid(), ${userId}, ${JSON.stringify(data)}::jsonb)
          ON CONFLICT ("userId") DO UPDATE SET preferences = EXCLUDED.preferences
        `;

        // Seed an initial Voice DNA from the answers (only when none exists —
        // never downgrades DNA that was built from real samples/AI analysis).
        const seed = await seedVoiceDnaFromOnboarding(userId, data as any);
        voiceDnaCreated = seed.created;
        break;
      }
    }

    return Response.json({
      success: true,
      voiceDnaCreated,
      message: step === 5
        ? voiceDnaCreated
          ? "Onboarding complete! Your Voice DNA was created from your answers. Now add writing samples to sharpen it."
          : "Onboarding complete! Now add writing samples to build your Voice DNA."
        : `Step ${step} saved.`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/account/onboarding — Get onboarding history + completion status
 *
 * `completed` drives the post-login gate: users who never finished the
 * questionnaire are sent to /onboarding until they do (or skip for now).
 */
export async function GET(request: any) {
  try {
    const userId = await requireAuthFromRequest(request as any);

    const snapshots = await sql`
      SELECT * FROM onboarding_snapshots
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" ASC
    `;

    const status = await getOnboardingStatus(userId);
    const hasStepFive = (snapshots as any[]).some((s: any) => s.step === 5);

    const completed =
      hasStepFive || status.profileCompleted || status.voiceDnaExists || status.hasContent;

    return Response.json({
      success: true,
      data: snapshots,
      completed,
      meta: {
        stepCount: (snapshots as any[]).length,
        voiceDnaExists: status.voiceDnaExists,
        hasContent: status.hasContent,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
