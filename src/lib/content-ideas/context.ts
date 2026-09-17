/**
 * getUserContentContext(userId) — collects the user's real data for the
 * AI originality pipeline. Reuses the EXISTING profile system
 * (user_profiles, voice_profiles, posts, content_ideas) — no duplicate
 * profile store. RedactAI-style notes are picked up from
 * user_profiles.preferences.notes when present (never mandatory).
 */

import { sql } from "@/lib/db";

export interface UserContentContext {
  name: string | null;
  jobTitle: string | null;
  industry: string | null;
  expertise: string[];
  targetAudience: string[];
  goals: string[];
  niche: string[];
  notes: string[]; // user notes (RedactAI-style) if any exist
  voiceSummary: string | null;
  recentTopics: string[];
  recentPostExcerpts: string[];
}

export async function getUserContentContext(userId: string): Promise<UserContentContext> {
  const [profileRow, voiceRow, postsRows, ideasRows] = await Promise.all([
    sql`SELECT * FROM "user_profiles" WHERE "userId" = ${userId} LIMIT 1`,
    sql`SELECT tone, "commonTopics", "sentenceStyle", "ctaStyle", "emojiUsage", "hookPatterns", "confidenceScore"
        FROM "voice_profiles" WHERE "userId" = ${userId} LIMIT 1`,
    sql`SELECT topic, format, content FROM "posts"
        WHERE "userId" = ${userId} AND status = 'PUBLISHED' AND content IS NOT NULL
        ORDER BY "publishedAt" DESC NULLS LAST, "createdAt" DESC LIMIT 10`,
    sql`SELECT title FROM "content_ideas" WHERE "userId" = ${userId} AND status = 'active' LIMIT 20`,
  ]);

  const profile = (profileRow as any[])[0] || null;
  const voice = (voiceRow as any[])[0] || null;
  const posts = (postsRows as any[]) || [];
  const ideas = (ideasRows as any[]) || [];

  const prefs = (profile?.preferences || {}) as Record<string, unknown>;
  const notes: string[] = Array.isArray(prefs.notes)
    ? (prefs.notes as unknown[]).filter((n): n is string => typeof n === "string" && n.trim().length > 0).slice(0, 10)
    : typeof prefs.notes === "string" && prefs.notes.trim()
      ? [prefs.notes.trim()]
      : [];

  return {
    name: null, // resolved by caller from the session if needed
    jobTitle: profile?.occupation || null,
    industry: (prefs.industry as string) || null,
    expertise: profile?.expertise || [],
    targetAudience: profile?.targetAudience || [],
    goals: profile?.linkedinGoals || [],
    niche: (prefs.niche as string[]) || [],
    notes,
    voiceSummary: voice
      ? [
          `Tone: ${(voice.tone || []).join(", ") || "conversational"}`,
          `Topics they write about: ${(voice.commonTopics || []).slice(0, 6).join(", ") || "—"}`,
          `Sentence style: ${voice.sentenceStyle || "—"}`,
          `CTA style: ${voice.ctaStyle || "—"}`,
          `Emoji usage: ${voice.emojiUsage || "low"}`,
        ].join(" | ")
      : null,
    recentTopics: Array.from(
      new Set([...posts.map((p) => p.topic).filter(Boolean), ...ideas.map((i) => i.title)])
    ).slice(0, 8) as string[],
    recentPostExcerpts: posts.slice(0, 5).map((p) => String(p.content).slice(0, 160)),
  };
}
