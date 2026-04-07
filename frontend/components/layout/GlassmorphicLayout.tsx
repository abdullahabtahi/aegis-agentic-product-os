"use client";

/**
 * GlassmorphicLayout — Main application shell.
 *
 * Matches Stitch design:
 * - Outer p-4 padding so content floats off screen edges
 * - flex h-screen with gap-4 between sidebar and main
 * - Sidebar is a flex item (rounded-2xl, full height)
 * - Main = header + scrollable content in a flex column
 * - Session drawer slides over the main content area
 */

import { ReactNode, useState, useCallback } from "react";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { Sidebar } from "./Sidebar";
import { HeaderBar } from "./HeaderBar";
import { SessionDrawer } from "./SessionDrawer";

interface GlassmorphicLayoutProps {
  children: ReactNode;
}

export function GlassmorphicLayout({ children }: GlassmorphicLayoutProps) {
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);

  const handleSessionHistoryToggle = useCallback(() => {
    setSessionDrawerOpen((prev) => !prev);
  }, []);

  return (
    <div className="relative flex h-screen overflow-hidden p-4 gap-4">
      <AmbientBackground />

      {/* Sidebar — flex item, full height, rounded */}
      <Sidebar
        onSessionHistoryToggle={handleSessionHistoryToggle}
        sessionHistoryOpen={sessionDrawerOpen}
      />

      {/* Session History Drawer — slides over main content from left */}
      <SessionDrawer
        open={sessionDrawerOpen}
        onClose={() => setSessionDrawerOpen(false)}
      />

      {/* Main content column */}
      <div className="flex flex-1 flex-col gap-4 overflow-hidden min-w-0">
        <HeaderBar />

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
