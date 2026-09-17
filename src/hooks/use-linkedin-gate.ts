"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Shared LinkedIn connection gate.
 *
 * Every surface that can publish (create page, content library, queue) uses
 * this to disable publishing until the user connects LinkedIn (with a valid,
 * unexpired token), and to show a consistent "connect first" prompt instead
 * of a failed API call.
 *
 * States: null = still checking, true = publishable, false = blocked.
 */
export function useLinkedInGate() {
  const [connected, setConnected] = useState<boolean | null>(null); // null = loading
  const [tokenValid, setTokenValid] = useState(true);
  const [displayName, setDisplayName] = useState<string | null>(null);
  // True right after the OAuth round-trip lands back on the page — pages use
  // it to show a "LinkedIn connected" confirmation.
  const [justConnected, setJustConnected] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/linkedin/status", { cache: "no-store" });
      const data = await res.json();
      if (data?.success && data.data) {
        const c = Boolean(data.data.connected);
        const valid = c ? data.data.tokenValid !== false : false;
        setConnected(c && valid);
        setTokenValid(valid);
        setDisplayName(data.data.displayName || null);
      } else {
        setConnected(false);
      }
    } catch {
      // If status can't be fetched, don't block the UI — the server still
      // rejects publish attempts with a clear error.
      setConnected(null);
    }
  }, []);

  useEffect(() => {
    // Detect OAuth return (?linkedin=connected) and clean the URL.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("linkedin") === "connected") {
        setJustConnected(true);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
    refresh();
  }, [refresh]);

  return { connected, tokenValid, displayName, justConnected, refresh, setConnected };
}

/**
 * Build the connect URL that returns the user to `returnTo` after OAuth.
 */
export function connectUrl(returnTo: string): string {
  return `/api/linkedin/connect?returnTo=${encodeURIComponent(returnTo)}`;
}
