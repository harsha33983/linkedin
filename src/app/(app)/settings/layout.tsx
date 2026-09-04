"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const settingsNav = [
  { label: "Profile", href: "/settings/profile" },
  { label: "LinkedIn", href: "/settings/linkedin" },
  { label: "AI Preferences", href: "/settings/ai-preferences" },
  { label: "Billing", href: "/settings/billing" },
  { label: "Account", href: "/settings/account" },
  { label: "Data Export", href: "/settings/data-export" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-0">
      {/* Settings Sidebar */}
      <aside className="w-48 border-r bg-gray-50 p-4 shrink-0">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">SETTINGS</h2>
        <nav className="space-y-1">
          {settingsNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block px-3 py-1.5 text-sm rounded-md transition-colors",
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
      </aside>

      {/* Settings Content */}
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
