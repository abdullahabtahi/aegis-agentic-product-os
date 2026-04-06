import { SEVERITY_BG } from "@/lib/constants";
import type { Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-mono uppercase tracking-wide",
        "px-1.5 py-0.5 rounded border",
        SEVERITY_BG[severity],
        className,
      )}
    >
      {severity}
    </span>
  );
}

interface EscalationBadgeProps {
  level: 1 | 2 | 3 | 4;
  className?: string;
}

const LEVEL_STYLES: Record<number, string> = {
  1: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  2: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  3: "bg-orange-400/10 text-orange-400 border-orange-400/20",
  4: "bg-red-400/10 text-red-400 border-red-400/20",
};

const LEVEL_LABELS: Record<number, string> = {
  1: "L1",
  2: "L2",
  3: "L3",
  4: "L4",
};

export function EscalationBadge({ level, className }: EscalationBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-mono uppercase tracking-wide",
        "px-1.5 py-0.5 rounded border",
        LEVEL_STYLES[level],
        className,
      )}
    >
      {LEVEL_LABELS[level]}
    </span>
  );
}
