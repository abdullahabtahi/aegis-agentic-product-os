"use client";

import { AppShell } from "@/components/layout/AppShell";
import { InterventionInbox } from "@/components/interventions/InterventionInbox";
import { useWorkspaceState } from "@/hooks/useWorkspaceState";

export default function InboxPage() {
  const { workspaceId } = useWorkspaceState();

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="px-4 py-2.5 border-b border-white/8">
          <span className="text-xs font-semibold text-white/70 tracking-wide uppercase">
            Intervention Inbox
          </span>
        </div>
        <InterventionInbox workspaceId={workspaceId} className="h-[calc(100vh-44px)]" />
      </div>
    </AppShell>
  );
}
