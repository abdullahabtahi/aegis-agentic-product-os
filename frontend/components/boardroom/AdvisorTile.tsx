"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { BoardroomAdvisor } from "@/lib/types";

export const ADVISOR_CONFIG: BoardroomAdvisor[] = [
  {
    id: "bear",
    name: "Jordan",
    role: "The Skeptic",
    tag: "Risk Analyst · Devil's Advocate",
    initials: "JO",
    avatarBg: "#fef2f2",
    accent: "#dc2626",
    activeBg: "rgba(220,38,38,0.08)",
  },
  {
    id: "bull",
    name: "Maya",
    role: "The Champion",
    tag: "Product Strategist · Opportunity",
    initials: "MY",
    avatarBg: "#f0fdf4",
    accent: "#059669",
    activeBg: "rgba(5,150,105,0.08)",
  },
  {
    id: "sage",
    name: "Ren",
    role: "The Operator",
    tag: "Execution Lead · Pragmatist",
    initials: "RN",
    avatarBg: "#eef2ff",
    accent: "#4f46e5",
    activeBg: "rgba(79,70,229,0.08)",
  },
];

const SOUND_WAVE_HEIGHTS = [14, 22, 30, 22, 14, 22, 30];

interface AdvisorTileProps {
  advisor: BoardroomAdvisor;
  isActive: boolean;
  subtitle?: string;
  className?: string;
}

function SoundWaveBars({ accent }: { accent: string }) {
  const prefersReduced = useReducedMotion();
  return (
    <div className="flex items-center gap-[2px] h-8">
      {SOUND_WAVE_HEIGHTS.map((h, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full"
          style={{ backgroundColor: accent, height: prefersReduced ? h : undefined }}
          animate={prefersReduced ? undefined : { height: [h * 0.5, h, h * 0.5] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.08,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function PulsingDot({ color }: { color: string }) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      className="h-2 w-2 rounded-full"
      style={{ backgroundColor: color }}
      animate={prefersReduced ? undefined : { opacity: [1, 0.3, 1] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export function AdvisorTile({
  advisor,
  isActive,
  subtitle,
  className,
}: AdvisorTileProps) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "relative flex items-center gap-3 rounded-xl border p-3 transition-colors",
        className,
      )}
      style={{
        borderTopColor: isActive ? advisor.accent : "transparent",
        borderTopWidth: isActive ? 3 : 1,
        borderColor: isActive ? undefined : "rgba(0,0,0,0.08)",
        backgroundColor: isActive ? advisor.activeBg : "rgba(255,255,255,0.6)",
        backdropFilter: "blur(12px)",
      }}
      animate={
        prefersReduced
          ? {}
          : isActive
            ? { scale: 1.03, y: -6 }
            : { scale: 1, y: 0 }
      }
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
    >
      {/* Avatar */}
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
        style={{
          backgroundColor: advisor.avatarBg,
          color: advisor.accent,
          border: `1.5px solid ${advisor.accent}30`,
        }}
      >
        {advisor.initials}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-gray-900">
            {advisor.name}
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            style={{ backgroundColor: `${advisor.accent}15`, color: advisor.accent }}
          >
            {advisor.role}
          </span>
        </div>
        <AnimatePresence mode="wait">
          {isActive && subtitle ? (
            <motion.p
              key="subtitle"
              className="mt-0.5 truncate text-xs text-gray-600"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              {subtitle}
            </motion.p>
          ) : (
            <motion.p
              key="tag"
              className="mt-0.5 truncate text-xs text-gray-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {advisor.tag}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Activity indicator */}
      <div className="shrink-0">
        <AnimatePresence mode="wait">
          {isActive ? (
            <motion.div
              key="wave"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <SoundWaveBars accent={advisor.accent} />
            </motion.div>
          ) : (
            <motion.div
              key="dot"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <PulsingDot color={advisor.accent} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
