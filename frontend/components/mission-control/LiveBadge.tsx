"use client";

interface LiveBadgeProps {
  lastUpdated?: string | null;
}

export function LiveBadge({ lastUpdated }: LiveBadgeProps) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-emerald-600">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      <span className="font-semibold tracking-wide">LIVE</span>
      {lastUpdated && (
        <span className="text-muted-foreground">· {lastUpdated}</span>
      )}
    </span>
  );
}
