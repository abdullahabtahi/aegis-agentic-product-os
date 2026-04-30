"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface BoardroomSessionTimerProps {
  startedAt: number | null;
  onWarning?: () => void;
  onHardStop?: () => void;
  className?: string;
}

const WARNING_MS = (15 - 2) * 60 * 1000; // 13 min — 2 min before hard cap
const HARD_STOP_MS = 15 * 60 * 1000;

function formatElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function BoardroomSessionTimer({
  startedAt,
  onWarning,
  onHardStop,
  className,
}: BoardroomSessionTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const warnedRef = useRef(false);
  const stoppedRef = useRef(false);
  const onWarningRef = useRef(onWarning);
  const onHardStopRef = useRef(onHardStop);

  useEffect(() => {
    onWarningRef.current = onWarning;
    onHardStopRef.current = onHardStop;
  }, [onWarning, onHardStop]);

  const tick = useCallback(() => {
    if (!startedAt) return;
    const ms = Date.now() - startedAt;
    setElapsed(ms);

    if (!warnedRef.current && ms >= WARNING_MS) {
      warnedRef.current = true;
      onWarningRef.current?.();
    }
    if (!stoppedRef.current && ms >= HARD_STOP_MS) {
      stoppedRef.current = true;
      onHardStopRef.current?.();
    }
  }, [startedAt]);

  useEffect(() => {
    if (!startedAt) return;
    warnedRef.current = false;
    stoppedRef.current = false;

    const id = setInterval(tick, 1000);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial tick avoids 1s blank display
    tick();
    return () => clearInterval(id);
  }, [startedAt, tick]);

  const isWarning = elapsed >= WARNING_MS;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono font-medium transition-colors",
        isWarning
          ? "bg-amber-100 text-amber-700"
          : "bg-white/50 text-gray-600",
        className,
      )}
    >
      <Clock className="h-3 w-3 shrink-0" />
      <span>{formatElapsed(elapsed)}</span>
    </div>
  );
}
