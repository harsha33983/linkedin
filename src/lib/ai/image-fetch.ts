/**
 * Image Fetch Utility
 *
 * Fetches relevant stock images from Unsplash based on search queries.
 * Used to attach cover images to AI-generated LinkedIn posts.
 *
 * Unsplash provides free, high-quality images for commercial use.
 */

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

/**
 * Fetch an image URL from Unsplash based on a search query.
 * Falls back to a curated list of relevant images if API is unavailable.
 *
 * @param page Unsplash results page to use (1 = first result). Pass a random
 *             page when regenerating so "New image" returns a different photo.
 */
export async function fetchPostImage(
  query: string,
  page: number = 1
): Promise<string | null> {
  // Try Unsplash API first
  if (UNSPLASH_ACCESS_KEY) {
    try {
      const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&page=${Math.max(1, Math.floor(page))}&orientation=landscape`,
        {
          headers: {
            Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.results?.[0]?.urls?.regular) {
          return data.results[0].urls.regular;
        }
      }
    } catch (error) {
      console.error("[ImageFetch] Unsplash API error:", error);
    }
  }

  // Fallback: use curated relevant images based on common topics
  return getCuratedImage(query);
}

/**
 * Curated fallback images for common LinkedIn post topics.
 * These are free-to-use Unsplash images.
 */
function getCuratedImage(query: string): string | null {
  const lowerQuery = query.toLowerCase();

  const curatedImages: { keywords: string[]; url: string }[] = [
    {
      keywords: ["coding", "developer", "programming", "software", "tech", "laptop", "code"],
      url: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800&h=400&fit=crop",
    },
    {
      keywords: ["team", "meeting", "collaboration", "office", "workplace"],
      url: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=400&fit=crop",
    },
    {
      keywords: ["startup", "growth", "business", "entrepreneur", "founder"],
      url: "https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=800&h=400&fit=crop",
    },
    {
      keywords: ["ai", "artificial intelligence", "machine learning", "data", "analytics"],
      url: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=400&fit=crop",
    },
    {
      keywords: ["marketing", "social media", "content", "linkedin", "brand"],
      url: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&h=400&fit=crop",
    },
    {
      keywords: ["learning", "education", "teach", "knowledge", "skill"],
      url: "https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=800&h=400&fit=crop",
    },
    {
      keywords: ["finance", "money", "invest", "profit", "revenue"],
      url: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800&h=400&fit=crop",
    },
    {
      keywords: ["leadership", "management", "strategy", "plan"],
      url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=400&fit=crop",
    },
    {
      keywords: ["productivity", "efficiency", "workflow", "tool"],
      url: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800&h=400&fit=crop",
    },
    {
      keywords: ["remote", "work from home", "digital nomad", "flexible"],
      url: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&h=400&fit=crop",
    },
    {
      keywords: ["innovation", "creative", "idea", "brainstorm"],
      url: "https://images.unsplash.com/photo-1455849318743-b2233052fcff?w=800&h=400&fit=crop",
    },
    {
      keywords: ["saas", "cloud", "platform", "software as a service"],
      url: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&h=400&fit=crop",
    },
  ];

  for (const entry of curatedImages) {
    if (entry.keywords.some((kw) => lowerQuery.includes(kw))) {
      return entry.url;
    }
  }

  // Default: generic business/technology image
  return "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800&h=400&fit=crop";
}
