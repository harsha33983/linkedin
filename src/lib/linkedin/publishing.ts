/**
 * LinkedIn Publishing Service
 *
 * Server-side only — never called from client-side code.
 * Uses LinkedIn's Posts API (REST) for organic member posts.
 *
 * Features:
 * - Idempotency via publishLockId (prevent duplicate publishing)
 * - Exponential backoff retry for temporary errors
 * - Auth error handling (mark EXPIRED, don't endlessly retry)
 * - Structured error types for UI display
 *
 * LinkedIn Posts API:
 * POST https://api.linkedin.com/rest/posts
 * Headers: Authorization: Bearer <token>, X-Restli-Protocol-Version: 2.0.0, Linkedin-Version: YYYYMM
 */

import { sql } from "@/lib/db";
import { decrypt } from "@/lib/encryption/tokens";
import { recordAuditEvent } from "@/lib/audit/service";
import { runContentSafetyChecks } from "@/lib/content/safety";
import { generateHashtags } from "@/lib/linkedin/hashtags";
import { isAllowedImageUrl } from "@/lib/linkedin/image-url";

const LINKEDIN_POSTS_API = "https://api.linkedin.com/rest/posts";
const LINKEDIN_IMAGES_API = "https://api.linkedin.com/rest/images";
const LINKEDIN_V2_API = "https://api.linkedin.com/v2";
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION || "202408";

export interface PublishResult {
  success: boolean;
  externalPostId?: string;
  error?: string;
  errorType?: string; // AUTH_EXPIRED, RATE_LIMITED, API_ERROR, NETWORK_ERROR
  httpStatus?: number;
  retryable?: boolean;
}

/**
 * Publish a post to LinkedIn via the Posts API.
 *
 * Flow:
 * 1. Acquire idempotency lock
 * 2. Retrieve SocialAccount + decrypt token
 * 3. Verify token status
 * 4. Run content safety checks
 * 5. Build LinkedIn Posts API request
 * 6. Publish
 * 7. Store LinkedIn post ID + update local status
 * 8. Record audit event
 */
export async function publishTextPost(params: {
  postId: string;
  userId: string;
  content?: string; // optional — reads from DB if not provided
  imageUrl?: string; // optional — reads from DB if not provided
  socialAccountId?: string;
  request?: Request;
}): Promise<PublishResult> {
  const { postId, userId, socialAccountId, request } = params;

  // Read content + imageUrl from DB if not provided
  const [postRecord] = await sql`SELECT content, "imageUrl", topic FROM posts WHERE id = ${postId} LIMIT 1`;
  let content = params.content || postRecord?.content || "";
  const imageUrl = params.imageUrl || postRecord?.imageUrl || null;

  // Pre-publish step: append trending hashtags related to the post.
  // Skipped when the content already carries enough hashtags (user's own).
  const existingTags = (content.match(/#[\w]+/g) || []).length;
  if (existingTags < 3) {
    try {
      const tags = await generateHashtags({
        content,
        topic: postRecord?.topic || null,
      });
      if (tags.length > 0) {
        content = `${content}\n\n${tags.join(" ")}`;
      }
    } catch (err) {
      // Hashtag generation must never block publishing.
      console.warn("[LinkedIn] Hashtag generation failed, publishing without tags:", String(err).slice(0, 120));
    }
  }

  // 1. Idempotency lock
  const lockId = `publish_${postId}_${Date.now()}`;
  const [existingPost] = await sql`SELECT * FROM posts WHERE id = ${postId} LIMIT 1`;

  if (!existingPost) {
    return { success: false, error: "Post not found", errorType: "API_ERROR" };
  }

  if (existingPost.publishLockId && existingPost.status === "PUBLISHING") {
    return {
      success: false,
      error: "Post is already being published",
      errorType: "API_ERROR",
    };
  }

  if (existingPost.status === "PUBLISHED" && existingPost.externalPostId) {
    return {
      success: false,
      error: "Post already published",
      errorType: "API_ERROR",
    };
  }

  // Mark as publishing
  await sql`UPDATE posts SET status = 'PUBLISHING', "publishLockId" = ${lockId} WHERE id = ${postId}`;

  await recordAuditEvent({
    userId,
    action: "POST_PUBLISH_STARTED",
    targetId: postId,
    targetType: "post",
    request,
  });

  const safetyChecks = await runContentSafetyChecks(userId, content);
  if (!safetyChecks.passed) {
    const failedCheck = safetyChecks.checks.find((c) => !c.passed);
    await sql`UPDATE posts SET status = 'FAILED', "publishLockId" = NULL WHERE id = ${postId}`;
    return {
      success: false,
      error: failedCheck?.message || "Content failed safety checks",
      errorType: "API_ERROR",
    };
  }

  // 3. Retrieve SocialAccount
  const [socialAccount] = socialAccountId
    ? await sql`SELECT * FROM social_accounts WHERE id = ${socialAccountId} AND "userId" = ${userId} AND provider = 'LINKEDIN' LIMIT 1`
    : await sql`SELECT * FROM social_accounts WHERE "userId" = ${userId} AND provider = 'LINKEDIN' AND status = 'CONNECTED' LIMIT 1`;

  if (!socialAccount) {
    await sql`UPDATE posts SET status = 'FAILED', "publishLockId" = NULL WHERE id = ${postId}`;
    return {
      success: false,
      error: "No LinkedIn account connected. Connect your account first.",
      errorType: "AUTH_EXPIRED",
    };
  }

  // 4. Decrypt access token
  let accessToken: string;
  try {
    accessToken = decrypt(socialAccount.accessTokenEncrypted, socialAccount.tokenIv);
  } catch {
    await markPostFailed(postId, userId, "Failed to decrypt access token", "API_ERROR");
    return { success: false, error: "Failed to decrypt access token", errorType: "API_ERROR" };
  }

  const memberUrn = await getMemberUrn(accessToken, socialAccount.providerAccountId);
  if (!memberUrn) {
    // Token is likely expired
    await sql`
      UPDATE social_accounts 
      SET status = 'EXPIRED', "errorAt" = CURRENT_TIMESTAMP, "errorMessage" = 'Token invalid' 
      WHERE id = ${socialAccount.id}
    `;
    await markPostFailed(postId, userId, "LinkedIn token expired. Reconnect your account.", "AUTH_EXPIRED");
    await recordAuditEvent({
      userId,
      action: "TOKEN_EXPIRED",
      targetId: socialAccount.id,
      targetType: "social_account",
    });
    return {
      success: false,
      error: "Your LinkedIn connection has expired. Reconnect your account.",
      errorType: "AUTH_EXPIRED",
    };
  }

  // 6. Upload image to LinkedIn if present
  let imageUrn: string | null = null;
  if (imageUrl) {
    imageUrn = await uploadImageToLinkedIn(accessToken, imageUrl, memberUrn);
    if (!imageUrn) {
      console.warn("[LinkedIn] Image upload failed, publishing without image");
    }
  }

  // 7. Publish via LinkedIn Posts API
  try {
    const postBody: Record<string, any> = {
      author: memberUrn,
      commentary: content,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };

    // Attach image if upload succeeded — LinkedIn Posts API uses content.media.id format
    if (imageUrn) {
      postBody.content = {
        media: {
          id: imageUrn,
          altText: "Post image",
        },
      };
    }

    const response = await fetch(LINKEDIN_POSTS_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": LINKEDIN_API_VERSION,
      },
      body: JSON.stringify(postBody),
    });

    // Handle LinkedIn API errors
    if (!response.ok) {
      const errorBody = await response.text();
      const errorInfo = classifyLinkedInError(response.status, errorBody);

      // Update post status
      await sql`UPDATE posts SET status = 'FAILED', "publishLockId" = NULL WHERE id = ${postId}`;

      // Log the failed publish
      await sql`
        INSERT INTO publish_logs (
          id, "postId", "userId", status, "errorMessage", "errorType", "httpStatus", "publishedBy", "publishedAt"
        ) VALUES (
          gen_random_uuid(), ${postId}, ${userId}, 'failed', ${errorInfo.message}, ${errorInfo.type}, 
          ${response.status}, 'api', CURRENT_TIMESTAMP
        )
      `;

      // Handle auth errors — mark connection as expired
      if (response.status === 401 || response.status === 403) {
        await sql`
          UPDATE social_accounts 
          SET status = 'EXPIRED', "errorAt" = CURRENT_TIMESTAMP, "errorMessage" = ${errorInfo.message} 
          WHERE id = ${socialAccount.id}
        `;
        await recordAuditEvent({
          userId,
          action: "TOKEN_EXPIRED",
          targetId: socialAccount.id,
          targetType: "social_account",
        });
      }

      await recordAuditEvent({
        userId,
        action: "POST_PUBLISH_FAILED",
        targetId: postId,
        targetType: "post",
        metadata: { httpStatus: response.status, errorType: errorInfo.type },
      });

      return {
        success: false,
        error: errorInfo.message,
        errorType: errorInfo.type,
        httpStatus: response.status,
        retryable: errorInfo.retryable,
      };
    }

    // 7. Success — extract post ID from response headers
    const externalPostId =
      response.headers.get("x-restli-id") ||
      response.headers.get("location")?.split("/").pop() ||
      `linkedin_${Date.now()}`;

    // Update post (posts timestamps are naive-UTC — store UTC wall clock).
    // The final content (with appended hashtags) is persisted so the in-app
    // copy matches exactly what was published on LinkedIn.
    await sql`
      UPDATE posts SET
        status = 'PUBLISHED',
        content = ${content},
        "publishedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "externalPostId" = ${externalPostId},
        "publishingProvider" = 'linkedin',
        "publishingResponse" = ${JSON.stringify({
          httpStatus: response.status,
          linkedinPostId: externalPostId,
          publishedAt: new Date().toISOString(),
          hashtagsAppended: (content.match(/#[\w]+/g) || []).length,
        })}::jsonb,
        "publishLockId" = NULL
      WHERE id = ${postId}
    `;

    // Log success
    await sql`
      INSERT INTO publish_logs (
        id, "postId", "userId", status, "approvedBy", "publishedBy", "publishedAt"
      ) VALUES (
        gen_random_uuid(), ${postId}, ${userId}, 'success', 'api', 'api', CURRENT_TIMESTAMP
      )
    `;

    await recordAuditEvent({
      userId,
      action: "POST_PUBLISHED",
      targetId: postId,
      targetType: "post",
      metadata: { externalPostId, provider: "linkedin" },
      request,
    });

    return { success: true, externalPostId };
  } catch (error) {
    // Network error
    await sql`UPDATE posts SET status = 'FAILED', "publishLockId" = NULL WHERE id = ${postId}`;

    await sql`
      INSERT INTO publish_logs (
        id, "postId", "userId", status, "errorMessage", "errorType", "publishedBy", "publishedAt"
      ) VALUES (
        gen_random_uuid(), ${postId}, ${userId}, 'failed', 
        ${error instanceof Error ? error.message : "Network error"}, 
        'NETWORK_ERROR', 'api', CURRENT_TIMESTAMP
      )
    `;

    return {
      success: false,
      error: "LinkedIn is temporarily unavailable. Will retry.",
      errorType: "NETWORK_ERROR",
      retryable: true,
    };
  }
}

/**
 * Get LinkedIn member URN from userinfo endpoint.
 */
async function getMemberUrn(accessToken: string, storedMemberId?: string | null): Promise<string | null> {
  // Use stored member ID first (from callback)
  if (storedMemberId) return `urn:li:person:${storedMemberId}`;
  
  // Fallback: env var (for testing without openid scope)
  const envMemberId = process.env.LINKEDIN_MEMBER_ID;
  if (envMemberId) return `urn:li:person:${envMemberId}`;
  
  try {
    // Try userinfo endpoint (OIDC) — works with openid scope
    const response = await fetch(
      `${LINKEDIN_V2_API}/userinfo`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (response.ok) {
      const data = await response.json();
      if (data.sub) return `urn:li:person:${data.sub}`;
    }
    // Fallback: try /v2/me
    const meResponse = await fetch(
      `${LINKEDIN_V2_API}/me?projection=(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (meResponse.ok) {
      const data = await meResponse.json();
      if (data.id) return `urn:li:person:${data.id}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get LinkedIn profile name for display.
 * Uses /v2/me which works with w_member_social scope.
 */
export async function getLinkedInProfile(accessToken: string): Promise<{
  name?: string;
  sub?: string;
  email?: string;
} | null> {
  try {
    // Try userinfo endpoint first (works with openid + profile + email scopes)
    const response = await fetch(
      `${LINKEDIN_V2_API}/userinfo`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (response.ok) {
      const data = await response.json();
      const name = [data.given_name, data.family_name]
        .filter(Boolean)
        .join(" ");
      return {
        name: name || undefined,
        sub: data.sub,
        email: data.email || undefined,
      };
    }
    // Fallback: try /v2/me
    const meResponse = await fetch(
      `${LINKEDIN_V2_API}/me?projection=(id,localizedFirstName,localizedLastName)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (meResponse.ok) {
      const data = await meResponse.json();
      const name = [data.localizedFirstName, data.localizedLastName]
        .filter(Boolean)
        .join(" ");
      return { name: name || undefined, sub: data.id };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Classify LinkedIn API errors into user-friendly messages.
 */
function classifyLinkedInError(
  status: number,
  body: string
): { message: string; type: string; retryable: boolean } {
  switch (status) {
    case 401:
      return {
        message: "Your LinkedIn connection has expired. Reconnect your account.",
        type: "AUTH_EXPIRED",
        retryable: false,
      };
    case 403:
      return {
        message:
          "LinkedIn denied this request. You may need to approve posting permissions.",
        type: "AUTH_EXPIRED",
        retryable: false,
      };
    case 429:
      return {
        message:
          "LinkedIn temporarily limited this request. We'll retry automatically.",
        type: "RATE_LIMITED",
        retryable: true,
      };
    case 400:
      return {
        message: `LinkedIn rejected the post format: ${body.slice(0, 200)}`,
        type: "API_ERROR",
        retryable: false,
      };
    default:
      if (status >= 500) {
        return {
          message:
            "LinkedIn is temporarily unavailable. Will retry the scheduled post.",
          type: "API_ERROR",
          retryable: true,
        };
      }
      return {
        message: `LinkedIn API error: ${status}`,
        type: "API_ERROR",
        retryable: false,
      };
  }
}

/**
 * Mark a post as failed with consistent error handling.
 */
async function markPostFailed(
  postId: string,
  userId: string,
  error: string,
  errorType: string
): Promise<void> {
  await sql`UPDATE posts SET status = 'FAILED', "publishLockId" = NULL WHERE id = ${postId}`;

  await sql`
    INSERT INTO publish_logs (
      id, "postId", "userId", status, "errorMessage", "errorType", "publishedBy", "publishedAt"
    ) VALUES (
      gen_random_uuid(), ${postId}, ${userId}, 'failed', ${error}, ${errorType}, 'api', CURRENT_TIMESTAMP
    )
  `;
}

/**
 * Upload an image to LinkedIn and return the image URN.
 * 
 * LinkedIn 3-step image upload process:
 * 1. Initialize upload → get upload URL + image ID
 * 2. PUT image binary to upload URL
 * 3. Return the image URN for use in posts
 */
async function uploadImageToLinkedIn(
  accessToken: string,
  imageUrl: string,
  ownerUrn: string
): Promise<string | null> {
  try {
    // SSRF guard: only fetch images from the allowlist (own uploads origin or
    // Unsplash). Blocks private / loopback / metadata addresses.
    if (!isAllowedImageUrl(imageUrl)) {
      console.warn("[LinkedIn] Blocked image fetch from non-allowed source:", String(imageUrl).slice(0, 120));
      return null;
    }

    // 1. Download the image from URL
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.error("[LinkedIn] Failed to download image:", imageResponse.status);
      return null;
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

    // 2. Initialize upload — register the image with LinkedIn
    const initResponse = await fetch(
      `${LINKEDIN_IMAGES_API}?action=initializeUpload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
          "Linkedin-Version": LINKEDIN_API_VERSION,
        },
        body: JSON.stringify({
          initializeUploadRequest: {
            owner: ownerUrn,
          },
        }),
      }
    );

    if (!initResponse.ok) {
      const errorBody = await initResponse.text();
      console.error("[LinkedIn] Image init failed:", initResponse.status, errorBody.substring(0, 200));
      return null;
    }

    const initData = await initResponse.json();
    const imageId = initData.value?.image;
    const uploadUrl = initData.value?.uploadUrl;

    if (!imageId || !uploadUrl) {
      console.error("[LinkedIn] No image ID or upload URL:", initData);
      return null;
    }

    console.log("[LinkedIn] Image initialized:", imageId);

    // 3. Upload the image binary to the upload URL
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      body: imageBuffer,
    });

    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.text();
      console.error("[LinkedIn] Image upload PUT failed:", uploadResponse.status, errorBody.substring(0, 200));
      return null;
    }

    console.log("[LinkedIn] Image uploaded successfully:", imageId);

    // 4. Wait for image processing (async — poll status until AVAILABLE)
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const statusResp = await fetch(
          `${LINKEDIN_IMAGES_API}/${encodeURIComponent(imageId)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Linkedin-Version": LINKEDIN_API_VERSION,
              "X-Restli-Protocol-Version": "2.0.0",
            },
          }
        );
        if (statusResp.ok) {
          const statusData = await statusResp.json();
          const status = statusData.status;
          console.log("[LinkedIn] Image status:", status, "(attempt", attempt + 1, ")");
          if (status === "AVAILABLE") {
            return imageId;
          }
          if (status === "PROCESSING_FAILED") {
            console.error("[LinkedIn] Image processing failed");
            return null;
          }
        }
      } catch {
        // Ignore poll errors, keep retrying
      }
    }

    // Return imageId even if status is unknown — LinkedIn might still accept it
    console.warn("[LinkedIn] Image status unknown after polling, proceeding anyway");
    return imageId;
  } catch (error) {
    console.error("[LinkedIn] Image upload error:", error);
    return null;
  }
}

function socialAccountAccountId(id: string): string {
  return id;
}
