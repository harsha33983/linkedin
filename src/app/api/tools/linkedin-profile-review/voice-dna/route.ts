import { NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors/api-errors";
import { trackEvent } from "@/lib/monitoring/analytics";

const voiceDnaSchema = z.object({
  analysisId: z.string().optional(),
  profileData: z
    .object({
      headline: z.string().optional(),
      about: z.string().optional(),
      experience: z.string().optional(),
      skills: z.array(z.string()).optional(),
      education: z.string().optional(),
    })
    .optional(),
});

/**
 * POST /api/tools/linkedin-profile-review/voice-dna
 *
 * "Use this profile to build my Voice DNA" — stores PROFILE SIGNALS.
 * Profile intelligence (WHO the user is) stays separate from Voice DNA
 * (HOW the user writes): writing signals live in voice_profiles; these
 * professional signals live in profile_signals and feed the DNA layers.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = voiceDnaSchema.parse(await request.json());

    let profile: z.infer<typeof voiceDnaSchema>["profileData"];
    let analysisId: string | null = body.analysisId || null;

    if (analysisId) {
      const [row] = await sql`
        SELECT "profileData", "userId" FROM linkedin_profile_analyses WHERE id = ${analysisId}
      `;
      if (!row) throw new NotFoundError("Analysis", analysisId);
      if (row.userId !== userId) throw new ValidationError("This analysis belongs to another account.");
      profile = row.profileData as z.infer<typeof voiceDnaSchema>["profileData"];
    } else if (body.profileData) {
      profile = body.profileData;
    } else {
      throw new ValidationError("Provide an analysisId or profileData.");
    }

    const headline = (profile?.headline || "").trim();
    const about = (profile?.about || "").trim();
    const skills = (profile?.skills || []).map((s) => s.trim()).filter(Boolean);

    // Derive profile intelligence deterministically from supplied content
    const words = (headline + " " + about)
      .toLowerCase()
      .match(/[a-z][a-z0-9+#.-]{2,}/g) || [];
    const cleanWords = words.map((w) => w.replace(/[.]+$/g, ""));
    const stop = new Set([
      "the", "and", "for", "with", "from", "to", "of", "in", "on", "at", "by", "as",
      "i", "my", "me", "we", "our", "you", "your", "is", "are", "was", "were", "that",
      "this", "have", "has", "had", "about", "into", "more", "most", "than", "help",
      "helping", "build", "building", "work", "worked", "working", "years",
    ]);
    const freq = new Map<string, number>();
    for (const w of cleanWords) {
      if (w.length < 3 || stop.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    const keywords = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w);

    // First line of About = positioning; audience from About markers
    const firstAboutLine = about.split("\n").map((l) => l.trim()).find(Boolean) || "";
    const audienceMatch = about.match(/i (?:help|work with|serve|support)\s+([^.]+)/i);
    const audience = audienceMatch ? audienceMatch[1].trim() : null;

    const [row] = await sql`
      INSERT INTO profile_signals (
        id, "userId", "professionalIdentity", expertise, topics, keywords,
        positioning, audience, "sourceAnalysisId", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, ${headline || null},
        ${JSON.stringify(skills.slice(0, 20))}::jsonb,
        ${JSON.stringify(keywords.slice(0, 10))}::jsonb,
        ${JSON.stringify(keywords)}::jsonb,
        ${firstAboutLine || null},
        ${audience},
        ${analysisId},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId") DO UPDATE SET
        "professionalIdentity" = EXCLUDED."professionalIdentity",
        expertise = EXCLUDED.expertise,
        topics = EXCLUDED.topics,
        keywords = EXCLUDED.keywords,
        positioning = EXCLUDED.positioning,
        audience = EXCLUDED.audience,
        "sourceAnalysisId" = EXCLUDED."sourceAnalysisId",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING id, "professionalIdentity", expertise, topics, keywords, positioning, audience
    `;

    trackEvent({ event: "voice_dna_created", source: "profile_review" });

    return Response.json({
      success: true,
      data: {
        profileSignalsId: row.id,
        professionalIdentity: row.professionalIdentity,
        expertise: row.expertise,
        topics: row.topics,
        keywords: row.keywords,
        positioning: row.positioning,
        audience: row.audience,
        message:
          "Profile intelligence saved. Your Voice DNA (writing style) remains separate — add writing samples in the Voice DNA page to combine both.",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}