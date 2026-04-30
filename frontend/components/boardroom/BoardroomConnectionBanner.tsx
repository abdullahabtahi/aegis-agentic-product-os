"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoardroomConnStatus } from "@/lib/types";

interface BoardroomConnectionBannerProps {
  status: BoardroomConnStatus;
  onRetry?: () => void;
  className?: string;
}

const STATUS_CONFIG: Record<
  BoardroomConnStatus,
  { label: string; icon: React.ReactNode; bg: string; text: string } | null
> = {
  live: null,
  idle: null,
  connecting: {
    label: "Connecting…",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    bg: "bg-indigo-50",
    text: "text-indigo-700",
  },
  reconnecting: {
    label: "Reconnecting…",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    bg: "bg-amber-50",
    text: "text-amber-700",
  },
  error: {
    label: "Connection lost",
    icon: <WifiOff className="h-3 w-3" />,
    bg: "bg-red-50",
    text: "text-red-700",
  },
};

export function BoardroomConnectionBanner({
  status,
  onRetry,
  className,
}: BoardroomConnectionBannerProps) {
  const config = STATUS_CONFIG[status];

  return (
    <AnimatePresence>
      {config && (
        <motion.div
          key={status}
          className={cn(
            "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
            config.bg,
            config.text,
            className,
          )}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {config.icon}
          <span>{config.label}</span>
          {status === "error" && onRetry && (
            <button
              onClick={onRetry}
              className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold underline-offset-1 hover:underline"
              aria-label="Retry connection"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          )}
        </motion.div>
      )}
      {status === "live" && (
        <motion.div
          key="live"
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-emerald-50 text-emerald-700",
            className,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Wifi className="h-3 w-3" />
          <span>Live</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
