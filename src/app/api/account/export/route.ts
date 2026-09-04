import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";

/**
 * GET /api/account/export — Full data export
 *
 * PRD §17: Users must always be able to export their writing samples,
 * Voice DNA, and post history in a portable format.
 */
export async function GET(request: any) {
  try {
    const userId = await requireAuthFromRequest(request as any);

    const [user] = await sql`SELECT id, name, email, "createdAt" FROM "user" WHERE id = ${userId}`;
    const [profile] = await sql`SELECT * FROM user_profiles WHERE "userId" = ${userId}`;
    const [voiceProfile] = await sql`SELECT * FROM voice_profiles WHERE "userId" = ${userId}`;
    const voiceVersions = await sql`SELECT * FROM voice_profile_versions WHERE "userId" = ${userId} ORDER BY version DESC`;
    const samples = await sql`SELECT id, content, source, "sourceType", weight, "createdAt" FROM writing_samples WHERE "userId" = ${userId} ORDER BY "createdAt" ASC`;
    const posts = await sql`SELECT id, title, content, topic, format, status, "scheduledAt", "publishedAt", "createdAt" FROM posts WHERE "userId" = ${userId} ORDER BY "createdAt" DESC`;
    const ideas = await sql`SELECT * FROM content_ideas WHERE "userId" = ${userId} ORDER BY "createdAt" DESC`;
    const generations = await sql`SELECT id, type, input, output, model, "rejectionReason", "createdAt" FROM generations WHERE "userId" = ${userId} ORDER BY "createdAt" DESC`;

    const exportData = {
      exportedAt: new Date().toISOString(),
      user,
      profile,
      voiceProfile,
      voiceProfileVersions: voiceVersions,
      writingSamples: samples,
      posts,
      ideas,
      generations,
    };

    return Response.json(exportData, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="linkedgrow-export-${userId.slice(0, 8)}.json"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
