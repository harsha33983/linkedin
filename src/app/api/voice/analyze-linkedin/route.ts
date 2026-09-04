/**
 * POST /api/voice/analyze-linkedin — Fetch LinkedIn posts and run NLP analysis
 *
 * 1. Get LinkedIn access token from social_accounts
 * 2. Fetch all posts from LinkedIn Posts API
 * 3. Store as writing samples (if not already stored)
 * 4. Run NLP analysis on all posts
 * 5. Update Voice DNA profile
 */

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { decrypt } from "@/lib/encryption/tokens";
import { analyzeWritingWithNLP } from "@/lib/voice/nlp-analyzer";
import { computeConfidenceScore } from "@/lib/voice/confidence";

const LINKEDIN_POSTS_API = "https://api.linkedin.com/rest/posts";
const LINKEDIN_V2_API = "https://api.linkedin.com/v2";
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION || "202408";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);

    // 1. Get LinkedIn connection (optional — DB-published posts still import without it)
    const [socialAccount] = await sql`
      SELECT * FROM social_accounts 
      WHERE "userId" = ${userId} AND provider = 'LINKEDIN' AND status = 'CONNECTED'
      LIMIT 1
    `;

    // 2. Decrypt access token (only if a connection exists)
    let accessToken: string | null = null;
    let memberUrn: string | null = null;
    if (socialAccount) {
      try {
        accessToken = decrypt(socialAccount.accessTokenEncrypted, socialAccount.tokenIv);
      } catch {
        console.warn("[LinkedIn NLP] Token decrypt failed — continuing with DB posts only.");
        accessToken = null;
      }

      const memberId = socialAccount.providerAccountId;
      if (memberId) {
        memberUrn = `urn:li:person:${memberId}`;
      }
    }

    // 4. Fetch posts from LinkedIn API (only when a usable connection exists)
    const allPosts: Array<{ content: string; publishedAt: string; externalId: string }> = [];

    if (accessToken && memberUrn) {
      console.log(`[LinkedIn NLP] Fetching posts for member: ${memberUrn}`);
      let start = 0;
      const count = 20;
      let hasMore = true;
      let maxPages = 10; // Safety limit

      while (hasMore && maxPages > 0) {
        try {
          const url = `${LINKEDIN_POSTS_API}?q=author&author=${encodeURIComponent(memberUrn)}&start=${start}&count=${count}&sortBy=LAST_MODIFIED`;
          
          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "X-Restli-Protocol-Version": "2.0.0",
              "Linkedin-Version": LINKEDIN_API_VERSION,
            },
          });

          if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[LinkedIn NLP] Posts fetch failed (${response.status}):`, errorBody.substring(0, 200));
            
            // If 403, the user doesn't have r_member_social permission
            if (response.status === 403) {
              // Try alternative: fetch via v2 endpoint
              const altPosts = await fetchPostsV2(accessToken, memberUrn.split(":").pop() || "");
              if (altPosts.length > 0) {
                allPosts.push(...altPosts);
              }
            }
            break;
          }

          const data = await response.json();
          const elements = data.elements || [];
          
          for (const post of elements) {
            // Extract text content from the post
            const content = extractPostContent(post);
            if (content && content.length > 20) {
              allPosts.push({
                content,
                publishedAt: post.createdAt ? new Date(post.createdAt).toISOString() : new Date().toISOString(),
                externalId: post.id || `post_${Date.now()}_${Math.random()}`,
              });
            }
          }

          // Check if there are more posts
          const paging = data.paging;
          if (paging && paging.start + paging.count < paging.total) {
            start += count;
            maxPages--;
          } else {
            hasMore = false;
          }
        } catch (fetchError) {
          console.error("[LinkedIn NLP] Fetch error:", fetchError);
          break;
        }
      }

      console.log(`[LinkedIn NLP] Fetched ${allPosts.length} posts from LinkedIn`);
    } else {
      console.log("[LinkedIn NLP] No live LinkedIn connection — using app-published posts.");
    }

    // 5. Also fetch posts from our database
    const dbPosts = await sql`
      SELECT content, "publishedAt", "externalPostId"
      FROM posts 
      WHERE "userId" = ${userId} 
      AND content IS NOT NULL 
      AND length(content) > 20
      ORDER BY "createdAt" DESC
      LIMIT 50
    `;

    for (const post of dbPosts as any[]) {
      if (post.content && post.content.length > 20) {
        allPosts.push({
          content: post.content,
          publishedAt: post.publishedAt || new Date().toISOString(),
          externalId: post.externalPostId || `db_${post.id || Date.now()}`,
        });
      }
    }

    // Deduplicate by content similarity
    const uniquePosts = deduplicatePosts(allPosts);
    console.log(`[LinkedIn NLP] Total unique posts: ${uniquePosts.length}`);

    if (uniquePosts.length === 0) {
      return Response.json(
        { success: false, error: "No posts found to analyze. Add writing samples manually." },
        { status: 400 }
      );
    }

    // 6. Store as writing samples (skip if already exists)
    const existingSamples = await sql`
      SELECT content FROM writing_samples WHERE "userId" = ${userId}
    `;
    const existingContents = new Set((existingSamples as any[]).map((s) => s.content?.substring(0, 100)));

    let newSamplesAdded = 0;
    for (const post of uniquePosts) {
      const contentPrefix = post.content.substring(0, 100);
      if (!existingContents.has(contentPrefix)) {
        await sql`
          INSERT INTO writing_samples (id, "userId", content, source, "sourceType", weight, "createdAt", "updatedAt")
          VALUES (
            gen_random_uuid(), ${userId}, ${post.content}, 'linkedin_import', 'linkedin_post', 1.0,
            ${new Date(post.publishedAt).toISOString()}::timestamp, CURRENT_TIMESTAMP
          )
        `;
        newSamplesAdded++;
      }
    }

    console.log(`[LinkedIn NLP] Added ${newSamplesAdded} new writing samples`);

    // 7. Fetch ALL writing samples for NLP analysis
    const allSamples = await sql`
      SELECT content FROM writing_samples WHERE "userId" = ${userId} ORDER BY "createdAt" ASC
    `;
    const sampleTexts = (allSamples as any[]).map((s) => s.content);

    // 8. Run NLP analysis on ALL samples (posts + imported)
    const nlpProfile = analyzeWritingWithNLP(sampleTexts);
    console.log("[LinkedIn NLP] Analysis complete:", nlpProfile.tone.voiceArchetype, "|", nlpProfile.consistency.sampleSize, "samples");

    // 9. Compute confidence
    const confidenceScore = computeConfidenceScore(sampleTexts.length, nlpProfile.consistency.voiceConsistencyScore);

    // 10. Build result from NLP
    const analysisResult = buildResultFromNLP(nlpProfile, sampleTexts);

    // 11. Get current version
    const [currentProfile] = await sql`SELECT version FROM voice_profiles WHERE "userId" = ${userId} LIMIT 1`;
    const nextVersion = (currentProfile?.version || 0) + 1;

    // 12. Upsert voice profile with NLP data
    const [voiceProfile] = await sql`
      INSERT INTO voice_profiles (
        id, "userId", tone, "sentenceStyle", "paragraphStyle", "hookPatterns",
        "ctaStyle", "emojiUsage", "commonTopics", "wordsToAvoid", "writingPatterns",
        "confidenceScore", "sampleCount", version, "sourceWeighting", metadata, "lastUpdated", "nlpProfile"
      ) VALUES (
        gen_random_uuid(), ${userId}, ${JSON.stringify(analysisResult.tone)}::jsonb,
        ${analysisResult.sentenceStyle}, ${analysisResult.paragraphStyle},
        ${JSON.stringify(analysisResult.hookPatterns)}::jsonb, ${analysisResult.ctaStyle},
        ${analysisResult.emojiUsage}, ${JSON.stringify(analysisResult.commonTopics)}::jsonb,
        ${analysisResult.wordsToAvoid}, ${JSON.stringify(analysisResult.writingPatterns)}::jsonb,
        ${confidenceScore}, ${sampleTexts.length}, ${nextVersion},
        '{"linkedin_post": 1, "linkedin_import": 0.9}'::jsonb,
        ${JSON.stringify({ ...analysisResult, source: "linkedin_nlp_analysis" })}::jsonb,
        CURRENT_TIMESTAMP, ${JSON.stringify(nlpProfile)}::jsonb
      )
      ON CONFLICT ("userId") DO UPDATE SET
        tone = EXCLUDED.tone,
        "sentenceStyle" = EXCLUDED."sentenceStyle",
        "paragraphStyle" = EXCLUDED."paragraphStyle",
        "hookPatterns" = EXCLUDED."hookPatterns",
        "ctaStyle" = EXCLUDED."ctaStyle",
        "emojiUsage" = EXCLUDED."emojiUsage",
        "commonTopics" = EXCLUDED."commonTopics",
        "wordsToAvoid" = EXCLUDED."wordsToAvoid",
        "writingPatterns" = EXCLUDED."writingPatterns",
        "confidenceScore" = EXCLUDED."confidenceScore",
        "sampleCount" = EXCLUDED."sampleCount",
        version = ${nextVersion},
        "sourceWeighting" = EXCLUDED."sourceWeighting",
        metadata = EXCLUDED.metadata,
        "lastUpdated" = CURRENT_TIMESTAMP,
        "nlpProfile" = EXCLUDED."nlpProfile"
      RETURNING *
    `;

    return Response.json({
      success: true,
      data: {
        voiceProfile,
        nlpProfile,
        postsFound: uniquePosts.length,
        newSamplesAdded,
        totalSamples: sampleTexts.length,
        confidenceTier:
          confidenceScore < 0.4 ? "Emerging" :
          confidenceScore < 0.7 ? "Solid" : "Strong",
        linkedinPostsCount: allPosts.length - (dbPosts as any[]).length,
        dbPostsCount: (dbPosts as any[]).length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Extract text content from a LinkedIn post object.
 */
function extractPostContent(post: any): string {
  // LinkedIn Posts API v2 format
  if (post.commentary) return post.commentary;
  
  // LinkedIn v2 format
  if (post.content?.text) return post.content.text;
  
  // Alternative format
  if (post.text) return post.text;
  
  // Try to extract from content body
  if (post.content?.contentEntities) {
    const texts = post.content.contentEntities
      .filter((e: any) => e.text)
      .map((e: any) => e.text);
    if (texts.length > 0) return texts.join("\n");
  }

  return "";
}

/**
 * Fallback: fetch posts via v2 endpoint
 */
async function fetchPostsV2(
  accessToken: string,
  memberId: string
): Promise<Array<{ content: string; publishedAt: string; externalId: string }>> {
  try {
    // Try /v2/ugcPosts (older endpoint that may work with w_member_social)
    const response = await fetch(
      `${LINKEDIN_V2_API}/ugcPosts?q=authors&authors=List(urn:li:person:${memberId})&sortBy=LAST_MODIFIED&count=20`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
          "Linkedin-Version": LINKEDIN_API_VERSION,
        },
      }
    );

    if (!response.ok) {
      console.error(`[LinkedIn NLP] v2 fetch failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const posts: Array<{ content: string; publishedAt: string; externalId: string }> = [];

    for (const item of data.elements || []) {
      const content = item?.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || 
                      item?.specificContent?.["com.linkedin.ugc.ShareContent"]?.text || "";
      
      if (content.length > 20) {
        posts.push({
          content,
          publishedAt: item.created?.time ? new Date(item.created.time).toISOString() : new Date().toISOString(),
          externalId: item.id || `v2_${Date.now()}_${Math.random()}`,
        });
      }
    }

    return posts;
  } catch (error) {
    console.error("[LinkedIn NLP] v2 fetch error:", error);
    return [];
  }
}

/**
 * Deduplicate posts by content prefix similarity.
 */
function deduplicatePosts(posts: Array<{ content: string; publishedAt: string; externalId: string }>) {
  const seen = new Map<string, typeof posts[0]>();
  
  for (const post of posts) {
    // Use first 100 chars as dedup key
    const key = post.content.substring(0, 100).toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, post);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Build VoiceAnalysisResult from NLP profile.
 */
function buildResultFromNLP(nlpProfile: any, samples: string[]) {
  const nlp = nlpProfile;
  
  const toneArr: string[] = [];
  if (nlp.tone.confidenceScore > 0.6) toneArr.push("confident");
  if (nlp.tone.warmthScore > 0.5) toneArr.push("encouraging");
  if (nlp.tone.formalityScore > 0.6) toneArr.push("formal");
  if (nlp.tone.directnessScore > 0.6) toneArr.push("direct");
  if (nlp.tone.humorScore > 0.3) toneArr.push("playful");
  if (toneArr.length === 0) toneArr.push("professional");

  const avgLen = nlp.sentenceStructure.avgSentenceLength;
  const sentenceStyle = avgLen < 8 ? "short" : avgLen < 15 ? "short-medium" : avgLen < 22 ? "medium" : "long";

  const paraStyle = nlp.paragraphStructure.singleSentenceParagraphs > 50 ? "short" : 
    nlp.paragraphStructure.singleSentenceParagraphs > 20 ? "medium" : "long";

  return {
    tone: toneArr,
    sentenceStyle,
    paragraphStyle: paraStyle,
    hookPatterns: nlp.hookPatterns.primaryHookTypes || [],
    ctaStyle: nlp.storytelling.ctaStyle || "none",
    emojiUsage: nlp.formatting.emojiFrequency > 0.3 ? "high" : nlp.formatting.emojiFrequency > 0.1 ? "moderate" : "low",
    commonTopics: (nlp.vocabulary.repetitionPatterns || []).slice(0, 5),
    wordsToAvoid: nlp.vocabulary.fillerWords || [],
    writingPatterns: {
      usesLists: nlp.paragraphStructure.bulletListUsage > 0.3 || nlp.paragraphStructure.numberedListUsage > 0.3,
      asksQuestions: nlp.sentenceStructure.questionRatio > 10,
      usesLineBreaks: nlp.paragraphStructure.lineBreakFrequency > 3,
      personalStories: nlp.hookPatterns.hookCharacteristics?.includes("personal_first") || false,
      avgSentenceLength: sentenceStyle,
      emotionalRange: nlp.tone.emotionalRange,
      voiceArchetype: nlp.tone.voiceArchetype,
    },
    consistencyScore: nlp.consistency?.voiceConsistencyScore || 0.5,
  };
}
