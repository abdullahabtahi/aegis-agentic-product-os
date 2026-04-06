"use client";

/**
 * AppShell — top-level layout: left nav + main + right panel.
 * Linear-inspired: compact sidebar, high information density.
 */

import { Layers, Bell, Settings, Activity, ShieldOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  pendingCount?: number;
}

const NAV_ITEMS = [
  { href: "/workspace", icon: Layers, label: "Mission Control" },
  { href: "/workspace/inbox", icon: Bell, label: "Inbox" },
  { href: "/workspace/suppression", icon: ShieldOff, label: "Suppression Log" },
  { href: "/workspace/activity", icon: Activity, label: "Activity" },
  { href: "/workspace/settings", icon: Settings, label: "Settings" },
];

export function AppShell({ children, rightPanel, pendingCount = 0 }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0A0A0F]">
      {/* Left nav — Linear-style compact sidebar */}
      <nav className="w-12 flex flex-col items-center py-4 border-r border-white/8 bg-[#0A0A0F] shrink-0">
        {/* Logo mark */}
        <div className="w-7 h-7 rounded-md bg-[#4F7EFF] flex items-center justify-center mb-6">
          <span className="text-white text-[10px] font-bold tracking-tight">Æ</span>
        </div>

        <div className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center relative transition-colors",
                  active
                    ? "bg-[#4F7EFF]/20 text-[#4F7EFF]"
                    : "text-white/30 hover:text-white/60 hover:bg-white/5",
                )}
              >
                <Icon className="w-4 h-4" />
                {/* Inbox badge */}
                {href.includes("inbox") && pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#4F7EFF] text-white text-[8px] flex items-center justify-center font-mono">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Right panel — Intervention Inbox */}
      {rightPanel && (
        <aside className="w-[320px] border-l border-white/8 shrink-0 overflow-hidden">
          {rightPanel}
        </aside>
      )}
    </div>
  );
}
