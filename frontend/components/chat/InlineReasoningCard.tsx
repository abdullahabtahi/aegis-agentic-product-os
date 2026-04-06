"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";

export interface InlineReasoningCardProps {
  cynic_view?: string;
  optimist_view?: string;
  synthesis?: string;
  risk_type?: string;
}

export function InlineReasoningCard({
  cynic_view,
  optimist_view,
  synthesis,
  risk_type,
}: InlineReasoningCardProps) {
  const [open, setOpen] = useState(true);

  // Auto-collapse after 3 seconds
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rounded-lg border border-white/8 bg-white/3 my-2 max-w-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/3 transition-colors"
      >
        <Brain className="size-3.5 text-[#4F7EFF] shrink-0" />
        <span className="text-[11px] font-semibold text-white/60 flex-1">
          Product Brain reasoning{risk_type ? ` · ${risk_type}` : ""}
        </span>
        {open ? (
          <ChevronDown className="size-3 text-white/25" />
        ) : (
          <ChevronRight className="size-3 text-white/25" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {cynic_view && (
            <div>
              <p className="text-[9px] font-mono text-red-400/70 mb-0.5 uppercase tracking-wider">Cynic</p>
              <p className="text-[11px] text-white/50 leading-relaxed">{cynic_view}</p>
            </div>
          )}
          {optimist_view && (
            <div>
              <p className="text-[9px] font-mono text-emerald-400/70 mb-0.5 uppercase tracking-wider">Optimist</p>
              <p className="text-[11px] text-white/50 leading-relaxed">{optimist_view}</p>
            </div>
          )}
          {synthesis && (
            <div>
              <p className="text-[9px] font-mono text-[#4F7EFF]/70 mb-0.5 uppercase tracking-wider">Synthesis</p>
              <p className="text-[11px] text-white/70 leading-relaxed">{synthesis}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
