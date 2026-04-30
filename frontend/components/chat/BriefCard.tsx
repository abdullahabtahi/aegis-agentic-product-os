"use client";

import Link from "next/link";
import { type FounderBrief } from "@/lib/types";
import { BriefBetRow } from "./BriefBetRow";

interface BriefCardProps {
  brief: FounderBrief;
  onDismiss?: () => void;
}

export function BriefCard({ brief, onDismiss }: BriefCardProps) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-4 text-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wide font-medium">
            Weekly Founder Brief
          </p>
          <p className="text-xs text-white/60 mt-0.5">{brief.week_label}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-white/30 hover:text-white/60 transition-colors text-xs"
            aria-label="Dismiss brief"
          >
            ✕
          </button>
        )}
      </div>

      {/* Bets at risk */}
      {brief.bets_at_risk.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-red-400/80 uppercase tracking-wide mb-1.5">
            Needs Attention
          </p>
          <div className="divide-y divide-white/5">
            {brief.bets_at_risk.map((s) => (
              <BriefBetRow key={s.bet_id} summary={s} />
            ))}
          </div>
        </div>
      )}

      {/* Bets improving */}
      {brief.bets_improving.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-emerald-400/80 uppercase tracking-wide mb-1.5">
            Gaining Momentum
          </p>
          <div className="divide-y divide-white/5">
            {brief.bets_improving.map((s) => (
              <BriefBetRow key={s.bet_id} summary={s} />
            ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex gap-4 text-xs text-white/40">
        <span>{brief.total_bets} bets</span>
        {brief.avg_conviction != null && (
          <span>avg conviction {Math.round(brief.avg_conviction)}</span>
        )}
        <span>{brief.scans_this_week} scans this week</span>
      </div>

      {/* Urgent intervention */}
      {brief.most_urgent_intervention && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <p className="text-[10px] text-amber-400/80 font-medium uppercase tracking-wide mb-0.5">
            Pending Action
          </p>
          <p className="text-xs text-white/70 leading-snug">
            {brief.most_urgent_intervention.headline ||
              brief.most_urgent_intervention.bet_name}
          </p>
        </div>
      )}

      {/* Weekly question */}
      <div className="border-t border-white/10 pt-3">
        <p className="text-xs text-white/40 mb-1 font-medium">
          This week&apos;s question:
        </p>
        <p className="text-xs text-white/80 italic leading-relaxed">
          &ldquo;{brief.weekly_question}&rdquo;
        </p>
      </div>

      {/* No scans CTA */}
      {brief.scans_this_week === 0 && (
        <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 flex items-center justify-between">
          <p className="text-xs text-indigo-300/80">No scans this week yet</p>
          <Link
            href="/workspace/directions"
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Scan now →
          </Link>
        </div>
      )}

      {/* CTAs */}
      <div className="flex gap-2 pt-1">
        <Link
          href="/workspace/inbox"
          className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-center text-white/70 hover:bg-white/10 transition-colors"
        >
          Open Inbox
          {brief.pending_intervention_count > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-indigo-500/30 text-indigo-300 text-[10px] w-4 h-4">
              {brief.pending_intervention_count}
            </span>
          )}
        </Link>
        <Link
          href="/workspace/directions"
          className="flex-1 rounded-lg bg-indigo-600/80 border border-indigo-500/30 px-3 py-2 text-xs text-center text-white font-medium hover:bg-indigo-500 transition-colors"
        >
          View Directions
        </Link>
      </div>
    </div>
  );
}
