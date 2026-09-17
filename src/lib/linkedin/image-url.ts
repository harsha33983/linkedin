/**
 * Image URL allowlist — SSRF guard (CRITICAL-2)
 *
 * Post cover images are fetched server-side by `uploadImageToLinkedIn` before
 * being uploaded to LinkedIn. A stored `imageUrl` is user-controlled, so an
 * attacker could otherwise point it at an internal address (cloud metadata,
 * localhost services, private network) and force the server to request it when
 * the post is published.
 *
 * We only ever expect two kinds of image sources in this app:
 *   1. Our own uploaded-asset origin  (NEXT_PUBLIC_APP_URL /uploads/...)
 *   2. Unsplash image CDN             (images.unsplash.com) — from fetchPostImage
 *
 * Everything else is rejected. Because the allowlist is an exact host set, we
 * don't need to scrape DNS or match IP ranges — non-allowlisted hosts simply
 * never make it to `fetch`.
 */

// Hosts that Unsplash uses to serve images (including the CDN subdomains).
const UNSPLASH_HOST_SUFFIX = "unsplash.com";

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

function isPrivateOrLoopback(host: string): boolean {
  const h = normalizeHost(host);
  if (h === "localhost" || h === "localhost.localdomain") return true;
  // Handle IPv4 literals and the link-local/metadata ranges a URL could carry.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 0) return true;
  }
  if (h === "[::1]" || h === "0:0:0:0:0:0:0:1" || h === "::1") return true;
  return false;
}

/**
 * Return the app's own allowed origin (e.g. "http://localhost:3001" or the
 * production domain). The upload endpoint returns absolute URLs built from this.
 */
function appAllowedHost(): string {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001");
    return normalizeHost(u.hostname);
  } catch {
    return "localhost";
  }
}

/**
 * Is `url` safe for the server to fetch as an image? Enforces http(s) and an
 * allowlist of hosts (the app's own origin, or Unsplash). Blocks private,
 * loopback, link-local, and metadata addresses.
 */
export function isAllowedImageUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0) return true; // null/empty = text-only post
  if (url.length > 2048) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const host = normalizeHost(parsed.hostname);
  if (isPrivateOrLoopback(host)) return false;

  // Allowed: the app's own origin (uploaded assets) or Unsplash.
  if (host === appAllowedHost()) return true;
  if (host === UNSPLASH_HOST_SUFFIX || host.endsWith("." + UNSPLASH_HOST_SUFFIX)) return true;

  return false;
}

/** Throw a reason when the URL is not allowed (used by callers for a clear error). */
export function assertAllowedImageUrl(url: string): void {
  if (!isAllowedImageUrl(url)) {
    throw new Error("Image URL is not from an allowed source.");
  }
}
