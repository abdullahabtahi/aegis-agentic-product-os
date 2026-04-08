"use client";

/**
 * SessionDrawer — Slide-in panel for ADK session history.
 *
 * Positioned to overlay the main content area (after sidebar + gap).
 * Layout: p-4 outer padding, w-20 sidebar, gap-4 = left offset is 112px.
 *
 * z-[45] so it sits above main content (z-0) but below any modals.
 * Fetches from /sessions API. Sessions are InMemory in dev (ephemeral after restart).
 */

import { useEffect, useState, useCallback } from "react";
import { X, MessageSquare, Clock } from "lucide-react";
import { getSessions } from "@/lib/api";
import type { SessionSummary, PipelineStatus } from "@/lib/types";

interface SessionDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (sessionId: string) => void;
}

const STATUS_DOT: Record<PipelineStatus, string> = {
  idle: "bg-slate-400",
  scanning: "bg-indigo-500 animate-pulse",
  analyzing: "bg-indigo-500 animate-pulse",
  awaiting_approval: "bg-amber-500 animate-pulse",
  executing: "bg-indigo-500 animate-pulse",
  complete: "bg-emerald-500",
  error: "bg-red-500",
};

function formatTime(ts: number | string): string {
  const date = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SessionDrawer({ open, onClose, onSelect }: SessionDrawerProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSessions();
      setSessions(data);
    } catch {
      // Silently fail — shows empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  // Offset = p-4 (16px) + w-20 (80px) + gap-4 (16px) = 112px
  const DRAWER_LEFT = "112px";

  return (
    <>
      {/* Backdrop — covers main content only */}
      {open && (
        <div
          className="fixed bottom-4 top-4 z-[45] bg-black/20 backdrop-blur-sm transition-opacity rounded-2xl"
          style={{ left: DRAWER_LEFT, right: "16px" }}
          onClick={onClose}
        />
      )}

      {/* Drawer panel — pointer-events-none when closed prevents blocking sidebar clicks */}
      <div
        className={`fixed bottom-4 top-4 z-[46] w-80 transform transition-transform duration-300 ease-out rounded-2xl overflow-hidden ${
          open
            ? "translate-x-0 pointer-events-auto"
            : "-translate-x-[500px] pointer-events-none"
        }`}
        style={{ left: DRAWER_LEFT }}
      >
        <div className="glass-panel-strong flex h-full flex-col rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/15 px-5 py-4">
            <h2 className="font-heading text-base font-semibold text-foreground/90">
              Session History
            </h2>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/15 hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading sessions...
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <MessageSquare size={24} className="text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No sessions yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Start a conversation on the Home page to create your first session
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sessions.map((session) => (
                  <button
                    key={session.session_id}
                    onClick={() => { onSelect(session.session_id); onClose(); }}
                    className="glass-panel-subtle w-full cursor-pointer rounded-xl p-4 text-left transition-all hover:bg-white/35"
                  >
                    <div className="mb-2 flex items-start gap-2">
                      <div
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          STATUS_DOT[session.pipeline_status] ?? STATUS_DOT.idle
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground/85">
                          {session.session_title ?? "Untitled session"}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock size={10} />
                          {formatTime(session.last_update_time)}
                        </div>
                      </div>
                    </div>
                    {session.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {session.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/15 p-4">
            <p className="text-center text-xs text-muted-foreground">
              Select a session to continue
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
