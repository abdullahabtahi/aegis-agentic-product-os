"use client";

import { BarChart2 } from "lucide-react";
import { useMemo } from "react";
import type { Intervention } from "@/lib/types";
import { LiveBadge } from "./LiveBadge";

const CHART_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getDayIndex(dateStr: string): number {
  // 0=Sunday, shift to Mon=0..Sun=6
  const d = new Date(dateStr).getUTCDay();
  return (d + 6) % 7;
}

function buildBarHeights(resolved: Intervention[]): number[] {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const counts = new Array<number>(7).fill(0);

  for (const intervention of resolved) {
    const ts = intervention.resolved_at ?? intervention.created_at;
    if (!ts) continue;
    const t = new Date(ts).getTime();
    if (t < sevenDaysAgo) continue;
    const idx = getDayIndex(ts);
    counts[idx]++;
  }

  const maxCount = Math.max(...counts, 1);
  return counts.map((c) => Math.max(c > 0 ? (c / maxCount) * 100 : 0, c === 0 ? 0 : 4));
}

interface ExecutionHealthChartProps {
  interventions: Intervention[];
}

export function ExecutionHealthChart({ interventions }: ExecutionHealthChartProps) {
  const resolved = interventions.filter((i) => i.status !== "pending");
  const isEmpty = resolved.length === 0;
  const bars = useMemo(() => (isEmpty ? [] : buildBarHeights(resolved)), [resolved, isEmpty]);

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-heading text-base font-semibold text-[#1a1c1d]">Execution Health</h2>
          <div className="mt-0.5">
            <LiveBadge lastUpdated={resolved.length > 0 ? "updated just now" : undefined} />
          </div>
        </div>
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#112478]" /> Volume
          </span>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center" style={{ height: "88px" }}>
          <BarChart2 size={20} className="text-slate-300" />
          <p className="text-[11px] text-muted-foreground">Pipeline health will appear after your first scan</p>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between gap-1 pt-1" style={{ height: "72px" }}>
            {bars.map((h, i) => (
              <div
                key={i}
                className="w-full rounded-t transition-all"
                style={{
                  height: `${Math.max(h, 4)}%`,
                  background: `rgba(17, 36, 120, ${0.12 + (h / 100) * 0.55})`,
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] font-medium text-muted-foreground">
            {CHART_DAYS.map((d) => <span key={d}>{d}</span>)}
          </div>
        </>
      )}
    </div>
  );
}
