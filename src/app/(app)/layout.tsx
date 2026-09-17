"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/errors/error-boundary";

const navigation = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "🔥 Viral Posts", href: "/viral-posts" },
  { label: "Create Post", href: "/create/ai-post" },
  { label: "Hooks", href: "/create/hooks" },
  { label: "Rewrite", href: "/create/rewrite" },
  { label: "Analyze", href: "/create/analyze" },
  { label: "Ideas", href: "/content/ideas" },
  { label: "Content", href: "/content" },
  { label: "Queue", href: "/queue" },
  { label: "Calendar", href: "/calendar" },
  { label: "Voice DNA", href: "/voice-dna" },
  { label: "Settings", href: "/settings/profile" },
  { label: "Integrations", href: "/settings/integrations" },
  { label: "Job Monitor", href: "/admin/jobs" },
  { label: "Profile Review", href: "/tools/linkedin-profile-review" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const gateCheckedRef = useRef(false);

  // Post-login onboarding gate: users who never completed the DNA
  // questionnaire are sent to /onboarding once per session (unless they
  // explicitly skipped it, or they are already on /onboarding).
  useEffect(() => {
    if (gateCheckedRef.current || pathname.startsWith("/onboarding")) return;
    gateCheckedRef.current = true;

    try {
      if (
        sessionStorage.getItem("onboarding_gate_checked") === "1" ||
        sessionStorage.getItem("onboarding_skipped") === "1"
      ) {
        return;
      }
      sessionStorage.setItem("onboarding_gate_checked", "1");
    } catch {
      /* private mode — ref still guards */
    }

    fetch("/api/account/onboarding", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && d.completed === false && !pathname.startsWith("/onboarding")) {
          router.replace("/onboarding");
        }
      })
      .catch(() => {
        /* never block the app on the gate */
      });
  }, [pathname, router]);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-gray-50 flex flex-col">
        <div className="p-4 border-b">
          <Link href="/dashboard" className="text-lg font-bold">
            LinkedGrow AI
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block px-3 py-2 text-sm rounded-md transition-colors",
                  isActive
                    ? "bg-gray-900 text-white"
                    : "text-gray-700 hover:bg-gray-200"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t text-xs text-gray-500">
          LinkedGrow AI v0.1.0
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
