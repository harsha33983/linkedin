"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /content/drafts — redirects to /content with DRAFT filter.
 * This route exists for URL compatibility (PRD §10 IA).
 */
export default function DraftsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/content");
  }, [router]);
  return null;
}
