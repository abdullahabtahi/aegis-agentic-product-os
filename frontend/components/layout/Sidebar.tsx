"use client";

/**
 * Sidebar — Dark narrow icon-only navigation (80px wide).
 * Matches Stitch design: rounded panel, large icons (24px), gap-8 spacing,
 * prominent active state with bg-white/15, hover scale animation.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Radar, Target, History, Settings } from "lucide-react";

interface SidebarProps {
  onSessionHistoryToggle: () => void;
  sessionHistoryOpen: boolean;
}

const NAV_ITEMS = [
  { href: "/workspace", icon: Home, label: "Home" },
  { href: "/workspace/mission-control", icon: Radar, label: "Mission Control" },
  { href: "/workspace/directions", icon: Target, label: "Directions" },
  { href: "/workspace/settings", icon: Settings, label: "Settings" },
] as const;

export function Sidebar({ onSessionHistoryToggle, sessionHistoryOpen }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="glass-sidebar relative z-50 flex h-full w-20 shrink-0 flex-col items-center rounded-2xl py-8">
      {/* Logo mark */}
      <div className="mb-10 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/30">
        <span className="font-heading text-xl font-bold tracking-tighter text-white">A</span>
      </div>

      {/* Navigation items */}
      <nav className="flex flex-1 flex-col items-center gap-7">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/workspace" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`group flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200 hover:scale-110 ${
                isActive
                  ? "bg-white/15 text-white shadow-md shadow-indigo-500/10"
                  : "text-white/40 hover:bg-white/8 hover:text-white/75"
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2 : 1.5} />
            </Link>
          );
        })}
      </nav>

      {/* Session History toggle — bottom */}
      <button
        onClick={onSessionHistoryToggle}
        title="Session History"
        className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200 hover:scale-110 ${
          sessionHistoryOpen
            ? "bg-white/15 text-white shadow-md shadow-indigo-500/10"
            : "text-white/40 hover:bg-white/8 hover:text-white/75"
        }`}
      >
        <History size={24} strokeWidth={sessionHistoryOpen ? 2 : 1.5} />
      </button>
    </aside>
  );
}
