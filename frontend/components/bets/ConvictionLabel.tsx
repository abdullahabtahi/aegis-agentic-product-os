"use client";

import { type ConvictionLevel, type ConvictionScore } from "@/lib/types";

const LEVEL_CONFIG: Record<
  ConvictionLevel,
  { label: string; bgClass: string; textClass: string }
> = {
  strong:     { label: "Strong",     bgClass: "bg-emerald-500/20",  textClass: "text-emerald-600"  },
  developing: { label: "Developing", bgClass: "bg-indigo-500/20",   textClass: "text-indigo-600"   },
  nascent:    { label: "Nascent",    bgClass: "bg-amber-500/20",    textClass: "text-amber-600"    },
  critical:   { label: "Critical",   bgClass: "bg-red-500/20",      textClass: "text-red-600"      },
};

interface ConvictionLabelProps {
  score: ConvictionScore;
  className?: string;
}

export function ConvictionLabel({ score, className = "" }: ConvictionLabelProps) {
  const config = LEVEL_CONFIG[score.level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${config.bgClass} ${config.textClass} ${className}`}
      title={`Conviction score: ${score.total}/100`}
    >
      {config.label}
      <span className="opacity-80">{Math.round(score.total)}</span>
    </span>
  );
}
