"use client";

import { GlassmorphicLayout } from "@/components/layout/GlassmorphicLayout";
import { useJulesPlanApproval } from "@/hooks/useJulesPlanApproval";

function JulesPlanApprovalRegistrar() {
  // Register the CopilotKit action for Jules L3 approval.
  // The hook calls useCopilotAction internally — just mounting it is enough.
  useJulesPlanApproval();
  return null;
}

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GlassmorphicLayout>
      <JulesPlanApprovalRegistrar />
      {children}
    </GlassmorphicLayout>
  );
}
