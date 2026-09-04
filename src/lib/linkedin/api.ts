/**
 * LinkedIn Share API Wrapper
 *
 * Handles posting to LinkedIn on behalf of a connected user.
 * Uses OAuth 2.0 with w_member_social scope.
 *
 * PRD §8.9: Automatic scheduling of user-approved content,
 * not autonomous content decisions.
 */

const LINKEDIN_API_BASE = "https://api.linkedin.com/v2";

export interface LinkedInPostResult {
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * Share a post on LinkedIn using the user's access token.
 */
export async function sharePost(
  accessToken: string,
  content: string,
  authorUrn?: string
): Promise<LinkedInPostResult> {
  try {
    // Get member ID if not provided
    const memberUrn = authorUrn || (await getMemberUrn(accessToken));
    if (!memberUrn) {
      return { success: false, error: "Could not determine LinkedIn member ID" };
    }

    const response = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: memberUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: {
              text: content,
            },
            shareMediaCategory: "NONE",
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("LinkedIn API error:", response.status, errorBody);
      return {
        success: false,
        error: `LinkedIn API error: ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      postId: data.id,
    };
  } catch (error) {
    console.error("LinkedIn share failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get the current user's LinkedIn member URN.
 */
export async function getMemberUrn(
  accessToken: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `${LINKEDIN_API_BASE}/userinfo`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const sub = data.sub;
    if (!sub) return null;

    return `urn:li:person:${sub}`;
  } catch {
    return null;
  }
}

/**
 * Validate that an access token is still valid.
 */
export async function validateToken(
  accessToken: string
): Promise<{ valid: boolean; expiresIn?: number }> {
  try {
    const response = await fetch(
      `${LINKEDIN_API_BASE}/userinfo`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return { valid: response.ok };
  } catch {
    return { valid: false };
  }
}
