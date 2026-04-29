"use client";

/**
 * Sidebar — Dark narrow icon-only navigation (80px wide).
 * Matches Stitch design: rounded panel, large icons (24px), gap-8 spacing,
 * prominent active state with bg-white/15, hover scale animation.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Home, MessageSquare, Radar, Target, Bell, Activity, History } from "lucide-react";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";
import { getInterventions } from "@/lib/api";

interface SidebarProps {
  onSessionHistoryToggle: () => void;
  sessionHistoryOpen: boolean;
}

const NAV_ITEMS = [
  { href: "/workspace", icon: Home, label: "Home" },
  { href: "/workspace/chat", icon: MessageSquare, label: "Chat" },
  { href: "/workspace/mission-control", icon: Radar, label: "Mission Control" },
  { href: "/workspace/directions", icon: Target, label: "Directions" },
  { href: "/workspace/inbox", icon: Bell, label: "Inbox" },
  { href: "/workspace/activity", icon: Activity, label: "Activity" },
] as const;

export function Sidebar({ onSessionHistoryToggle, sessionHistoryOpen }: SidebarProps) {
  const pathname = usePathname();
  const workspaceId = useWorkspaceId();

  // Badge query — silent failure: if this errors, badge is simply absent
  const { data: interventions = [] } = useQuery({
    queryKey: ["interventions", workspaceId, "badge"],
    queryFn: () => getInterventions(workspaceId),
    staleTime: 15_000,
    enabled: workspaceId !== "default_workspace",
  });

  const pendingCount = interventions.filter((i) => i.status === "pending").length;

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
          const showBadge = item.href === "/workspace/inbox" && pendingCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`group relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200 hover:scale-110 ${
                isActive
                  ? "bg-white/15 text-white shadow-md shadow-indigo-500/10"
                  : "text-white/40 hover:bg-white/8 hover:text-white/75"
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2 : 1.5} />
              {showBadge && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
              )}
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
