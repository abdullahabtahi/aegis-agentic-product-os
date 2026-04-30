"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { X, Bell, Sparkles } from "lucide-react";
import { InterventionInbox } from "./InterventionInbox";
import { cn } from "@/lib/utils";

interface InboxDrawerProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  pendingCount: number;
}

const SPRING: Transition = { type: "spring", stiffness: 380, damping: 35, mass: 0.8 };

export function InboxDrawer({ open, onClose, workspaceId, pendingCount }: InboxDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setTimeout(() => closeButtonRef.current?.focus(), 80);
  }, [open]);

  const hasPending = pendingCount > 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="inbox-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-slate-900/15 backdrop-blur-[3px]"
            aria-hidden="true"
            onClick={onClose}
          />

          <motion.aside
            key="inbox-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Approvals Inbox"
            initial={{ x: "100%", opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={SPRING}
            className="fixed right-4 top-4 bottom-4 z-50 flex w-[460px] flex-col overflow-hidden rounded-2xl border border-white/25 bg-white/90 shadow-2xl shadow-slate-900/15 backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between px-5 py-4 border-b border-slate-200/50">
              <div className="flex items-center gap-3">
                {/* Icon with pulse ring when pending */}
                <div className="relative">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-xl ring-1 transition-colors",
                    hasPending
                      ? "bg-amber-50 ring-amber-200/70"
                      : "bg-indigo-50 ring-indigo-200/60",
                  )}>
                    <Bell className={cn("h-4 w-4", hasPending ? "text-amber-500" : "text-indigo-500")} />
                  </div>
                  {hasPending && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white"
                    >
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </motion.span>
                  )}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800 leading-tight">Approvals</h2>
                  <p className="text-[10px] leading-none mt-0.5 font-medium">
                    {hasPending ? (
                      <span className="text-amber-500">{pendingCount} pending decision{pendingCount > 1 ? "s" : ""}</span>
                    ) : (
                      <span className="text-emerald-500 flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" />All clear</span>
                    )}
                  </p>
                </div>
              </div>

              <button
                ref={closeButtonRef}
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                aria-label="Close inbox"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              <InterventionInbox workspaceId={workspaceId} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
