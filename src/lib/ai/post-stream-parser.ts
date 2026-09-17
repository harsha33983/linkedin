/**
 * Streaming post-generation protocol parser.
 *
 * The model streams plain text in the delimiter protocol defined in
 * post-generation-stream.ts. This parser consumes raw text chunks and emits
 * structured events THE MOMENT they can be derived — so the browser renders
 * post text line-by-line while the model is still writing.
 *
 * Events:
 *   { type: "version_start", index, label, format, scores?, imageQuery? }
 *   { type: "content", index, delta }        — a text delta for version `index`
 *   { type: "version_done", index }          — version finished
 *   { type: "meta", ... }                    — meta lines after content belong to the NEXT version
 */

export const VERSION_DELIMITER = "===VERSION===";

export interface StreamEvent {
  type: "version_start" | "content" | "version_done";
  index: number;
  label?: string;
  format?: string;
  hook?: string;
  scores?: { overall: number; voiceFit: number };
  imageQuery?: string;
  delta?: string;
}

interface VersionState {
  meta: any | null;
  content: string;
}

/**
 * Incremental parser. Feed `push(chunk)` raw text; it calls `onEvent` with
 * everything derivable from the bytes seen so far. Works across arbitrary
 * chunk boundaries (tokens, lines, half-lines).
 */
export class PostStreamParser {
  private buffer = "";
  private versions: VersionState[] = [];
  private inMeta = true; // each version begins expecting its META line
  private onEvent: (e: StreamEvent) => void;

  constructor(onEvent: (e: StreamEvent) => void) {
    this.onEvent = onEvent;
  }

  push(chunk: string) {
    this.buffer += chunk;

    // Process every complete line; keep the (possibly partial) tail buffered.
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      this.handleLine(line);
    }
  }

  /** Flush any trailing partial line (call when the stream ends). */
  finish() {
    if (this.buffer.trim()) {
      this.handleLine(this.buffer);
      this.buffer = "";
    }
    // Close any open version
    if (this.versions.length > 0 && this.versions[this.versions.length - 1]) {
      const idx = this.versions.length - 1;
      this.onEvent({ type: "version_done", index: idx });
    }
  }

  private handleLine(line: string) {
    const trimmed = line.trim();

    // Model occasionally wraps output in markdown fences — ignore them
    if (trimmed === "```") return;

    // Version delimiter → close current, next lines are the next version's META
    if (trimmed === VERSION_DELIMITER) {
      const idx = this.versions.length - 1;
      if (idx >= 0) this.onEvent({ type: "version_done", index: idx });
      this.inMeta = true;
      return;
    }

    // META line (only valid while expecting one)
    if (this.inMeta && trimmed.startsWith("META:")) {
      let meta: any = null;
      try {
        meta = JSON.parse(trimmed.slice(5).trim());
      } catch {
        meta = null;
      }
      this.versions.push({ meta, content: "" });
      const index = this.versions.length - 1;
      this.onEvent({
        type: "version_start",
        index,
        label: meta?.label,
        format: meta?.format,
        hook: meta?.hook,
        scores: meta?.scores,
        imageQuery: meta?.imageQuery,
      });
      this.inMeta = false;
      return;
    }

    // Content line → belongs to the current version
    if (this.versions.length === 0) {
      // Junk before any META (e.g. model preamble) — ignore
      return;
    }
    const idx = this.versions.length - 1;
    const withNewline = line + "\n";
    this.versions[idx].content += withNewline;
    this.onEvent({ type: "content", index: idx, delta: withNewline });
  }

  /** Assemble final result after finish(). */
  getVersions() {
    return this.versions.map((v, i) => {
      const meta = v.meta || {};
      const content = v.content.replace(/\n+$/, "").trim();
      const firstLine = content.split("\n")[0]?.trim() || "";
      const hook = (meta.hook && String(meta.hook).trim()) || firstLine;
      return {
        id: `v${i + 1}`,
        label: meta.label || ["Recommended", "Different angle", "Alternative format"][i] || `Version ${i + 1}`,
        content,
        hook,
        format: meta.format || "Educational",
        scores: {
          overall: Number(meta.scores?.overall) || 80,
          voiceFit: Number(meta.scores?.voiceFit) || 75,
        },
        imageQuery: meta.imageQuery || topicFromContent(hook),
      };
    });
  }
}

function topicFromContent(hook: string): string {
  return (hook || "linkedin post")
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .slice(0, 5)
    .join(" ")
    .toLowerCase();
}
