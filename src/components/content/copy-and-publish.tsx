"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Copy/Publish Workflow Component
 *
 * PRD §16: Fallback UX before/without LinkedIn API access.
 * One-click "Copy to clipboard, open LinkedIn" flow.
 * Gets user 90% of time savings without any API dependency.
 */
interface CopyAndPublishProps {
  content: string;
  postId?: string;
  onPublished?: () => void;
}

export function CopyAndPublish({ content, postId, onPublished }: CopyAndPublishProps) {
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setMessage("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Failed to copy. Please select and copy manually.");
    }
  };

  const openLinkedIn = () => {
    window.open("https://www.linkedin.com/feed/", "_blank");
  };

  const publishViaApi = async () => {
    if (!postId) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/posts/${postId}/publish`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        if (data.data.published) {
          setMessage("Published to LinkedIn!");
        } else if (data.data.copyPath) {
          await copyToClipboard();
          openLinkedIn();
          setMessage("Copied! Paste in LinkedIn.");
        }
        onPublished?.();
      } else {
        setMessage(data.error || "Publish failed.");
      }
    } catch {
      setMessage("Publish failed.");
    }
    setPublishing(false);
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Button size="sm" onClick={publishViaApi} disabled={publishing}>
        {publishing ? "Publishing..." : postId ? "Publish to LinkedIn" : "Copy & Open LinkedIn"}
      </Button>
      <Button size="sm" variant="outline" onClick={copyToClipboard}>
        {copied ? "✓ Copied" : "Copy to Clipboard"}
      </Button>
      <Button size="sm" variant="ghost" onClick={openLinkedIn}>
        Open LinkedIn
      </Button>
      {message && (
        <span className="text-sm text-gray-600">{message}</span>
      )}
    </div>
  );
}
