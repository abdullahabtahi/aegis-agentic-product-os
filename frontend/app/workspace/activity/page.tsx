"use client";

import { AppShell } from "@/components/layout/AppShell";
import { Activity } from "lucide-react";

export default function ActivityPage() {
  return (
    <AppShell>
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <Activity className="w-8 h-8 text-white/15 mx-auto" />
          <p className="text-sm text-white/25">Activity log — Phase 6</p>
        </div>
      </div>
    </AppShell>
  );
}
