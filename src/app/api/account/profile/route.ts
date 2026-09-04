import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().optional(),
  occupation: z.string().optional(),
  expertise: z.array(z.string()).optional(),
  targetAudience: z.array(z.string()).optional(),
  linkedinGoals: z.array(z.string()).optional(),
  preferences: z.record(z.unknown()).optional(),
});

/**
 * GET /api/account/profile — Get user profile + onboarding data
 */
export async function GET(request: any) {
  try {
    const userId = await requireAuthFromRequest(request as any);

    const [user] = await sql`SELECT id, name, email, image, "createdAt" FROM "user" WHERE id = ${userId}`;
    const [profile] = await sql`SELECT * FROM user_profiles WHERE "userId" = ${userId}`;

    return Response.json({ success: true, data: { user, profile } });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/account/profile — Update user profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const parsed = updateProfileSchema.parse(body);

    // Update user name if provided
    if (parsed.name) {
      await sql`UPDATE "user" SET name = ${parsed.name} WHERE id = ${userId}`;
    }

    const { name, ...profileData } = parsed;
    
    // NOTE: expertise/targetAudience/linkedinGoals are text[] columns in the
    // live DB — pass arrays directly, NOT ::jsonb (which raises 42804).
    // preferences stays jsonb.
    const preferences = profileData.preferences ? JSON.stringify(profileData.preferences) : null;

    const [profile] = await sql`
      INSERT INTO user_profiles (
        id, "userId", occupation, expertise, "targetAudience", "linkedinGoals", preferences
      ) VALUES (
        gen_random_uuid(), ${userId}, ${profileData.occupation || null}, 
        ${profileData.expertise || []}, ${profileData.targetAudience || []}, ${profileData.linkedinGoals || []}, ${preferences}::jsonb
      )
      ON CONFLICT ("userId") DO UPDATE SET
        occupation = EXCLUDED.occupation,
        expertise = EXCLUDED.expertise,
        "targetAudience" = EXCLUDED."targetAudience",
        "linkedinGoals" = EXCLUDED."linkedinGoals",
        preferences = EXCLUDED.preferences
      RETURNING *
    `;

    return Response.json({ success: true, data: profile });
  } catch (error) {
    return handleApiError(error);
  }
}
