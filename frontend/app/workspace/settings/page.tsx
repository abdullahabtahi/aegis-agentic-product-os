"use client";

import { AppShell } from "@/components/layout/AppShell";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <Settings className="w-8 h-8 text-white/10 mx-auto" />
          <p className="text-sm text-white/25">Settings — Phase 6</p>
          <p className="text-[10px] text-white/15">
            control_level · workspace config · Linear API
          </p>
        </div>
      </div>
    </AppShell>
  );
}
