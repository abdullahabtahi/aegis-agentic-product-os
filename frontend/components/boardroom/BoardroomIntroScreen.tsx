"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Mic, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdvisorTile, ADVISOR_CONFIG } from "./AdvisorTile";
import type { BoardroomContext } from "@/lib/types";

interface BoardroomIntroScreenProps {
  context: BoardroomContext | null;
  contextStatus: "loading" | "ready" | "error";
  onBegin: () => void;
}

const CONTAINER_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.45 } },
};

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 22 } },
};

export function BoardroomIntroScreen({
  context,
  contextStatus,
  onBegin,
}: BoardroomIntroScreenProps) {
  const [contextOpen, setContextOpen] = useState(false);

  // Error state: let the user proceed with a warning — don't silently block
  const canBegin = contextStatus === "ready" || contextStatus === "error";

  const handleBegin = useCallback(() => {
    if (canBegin) onBegin();
  }, [canBegin, onBegin]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f9f9ff] px-4 py-16">
      {/* Radial gradient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-0 -z-10 h-[50vh] w-[80vw] -translate-x-1/2 rounded-full blur-[120px] opacity-25"
        style={{ background: "radial-gradient(circle, #818cf8 0%, #3b2bee 50%, transparent 70%)" }}
      />

      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Meet your advisors</h1>
          <p className="mt-2 text-gray-500">Three perspectives. One decision. Let&apos;s talk.</p>
        </div>

        {/* Advisor cards — staggered entrance */}
        <motion.div
          className="space-y-3"
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          {ADVISOR_CONFIG.map((advisor) => (
            <motion.div key={advisor.id} variants={CARD_VARIANTS}>
              <AdvisorTile advisor={advisor} isActive={false} />
            </motion.div>
          ))}
        </motion.div>

        {/* Context preview accordion */}
        {context && (
          <motion.div
            className="mt-6 rounded-2xl border border-white/60 bg-white/60 backdrop-blur-xl overflow-hidden"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5, duration: 0.4 }}
          >
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50/50 transition-colors"
              onClick={() => setContextOpen((v) => !v)}
              aria-expanded={contextOpen}
            >
              <span>What they know about this bet</span>
              {contextOpen ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
            {contextOpen && (
              <div className="border-t border-gray-100 px-4 py-3 space-y-2 text-xs text-gray-600">
                <p><span className="font-medium">Bet:</span> {context.betName}</p>
                {context.hypothesis && (
                  <p><span className="font-medium">Hypothesis:</span> {context.hypothesis}</p>
                )}
                <p><span className="font-medium">Decision:</span> {context.decisionQuestion}</p>
                {context.riskSignals.length > 0 && (
                  <p>
                    <span className="font-medium">Risk signals loaded:</span>{" "}
                    {context.riskSignals.length} (advisors will cite these)
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Error warning — context failed but user can still proceed */}
        {contextStatus === "error" && (
          <motion.div
            className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Advisors will work from your hypothesis only — bet context failed to load.</span>
          </motion.div>
        )}

        {/* CTA */}
        <motion.div
          className="mt-8 space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8 }}
        >
          <button
            onClick={handleBegin}
            disabled={!canBegin}
            className={cn(
              "w-full rounded-full py-3.5 text-sm font-semibold transition-all",
              canBegin
                ? "bg-gray-900 text-white shadow-lg hover:bg-gray-800 active:scale-[0.98]"
                : "cursor-not-allowed bg-gray-200 text-gray-400",
            )}
          >
            {contextStatus === "loading" ? "Loading context…" : "Begin Boardroom"}
          </button>
          <div className="space-y-1 text-center">
            <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <Mic className="h-3 w-3" />
              <span>Your microphone will activate when you click</span>
            </p>
            <p className="text-xs text-gray-400">Tip: use headphones for best experience</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
