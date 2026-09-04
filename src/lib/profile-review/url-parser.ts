/**
 * LinkedIn Profile URL Parser
 *
 * Accepts:
 *   https://www.linkedin.com/in/username
 *   http://linkedin.com/in/username
 *   linkedin.com/in/username
 *   @username
 *   username (bare handle)
 *
 * Rejects everything else with a specific error message.
 */

export interface ParsedLinkedInProfile {
  username: string;
  /** Canonical public profile URL. */
  profileUrl: string;
  /** Where the input came from, for display. */
  input: string;
}

const USERNAME_REGEX = /^[A-Za-z0-9-]{2,100}$/;

export class InvalidLinkedInUrlError extends Error {
  constructor(message = "Please enter a valid LinkedIn profile URL.") {
    super(message);
    this.name = "InvalidLinkedInUrlError";
  }
}

export function parseLinkedInProfileUrl(input: string): ParsedLinkedInProfile {
  const raw = (input || "").trim();

  if (!raw) {
    throw new InvalidLinkedInUrlError("Please enter a LinkedIn profile URL.");
  }

  // @username
  if (raw.startsWith("@")) {
    const username = raw.slice(1).trim();
    if (!USERNAME_REGEX.test(username)) {
      throw new InvalidLinkedInUrlError("Please enter a valid LinkedIn profile URL.");
    }
    return { username, profileUrl: `https://www.linkedin.com/in/${username}`, input: raw };
  }

  // Try URL forms
  const hasUrl = /^https?:\/\//i.test(raw) || raw.includes("linkedin.com");
  if (hasUrl) {
    let url: URL;
    try {
      url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    } catch {
      throw new InvalidLinkedInUrlError("Please enter a valid LinkedIn profile URL.");
    }

    const host = url.hostname.toLowerCase();
    const isLinkedInHost =
      host === "linkedin.com" ||
      host.endsWith(".linkedin.com") ||
      host === "www.linkedin.com";

    if (!isLinkedInHost) {
      throw new InvalidLinkedInUrlError("Please enter a valid LinkedIn profile URL.");
    }

    // /in/<username>[/...]
    const segments = url.pathname.split("/").filter(Boolean);
    const inIndex = segments.indexOf("in");
    const username = inIndex >= 0 ? segments[inIndex + 1] : null;

    if (!username || !USERNAME_REGEX.test(username)) {
      throw new InvalidLinkedInUrlError(
        "That doesn't look like a LinkedIn profile URL. Use the format linkedin.com/in/username."
      );
    }

    return { username, profileUrl: `https://www.linkedin.com/in/${username}`, input: raw };
  }

  // Bare handle
  if (USERNAME_REGEX.test(raw)) {
    return { username: raw, profileUrl: `https://www.linkedin.com/in/${raw}`, input: raw };
  }

  throw new InvalidLinkedInUrlError("Please enter a valid LinkedIn profile URL.");
}