"use client";

import { Zap, Loader2 } from "lucide-react";

interface ScanButtonProps {
  onClick: () => void;
  isPending: boolean;
  disabled: boolean;
  workspaceFallback: boolean;
}

export function ScanButton({ onClick, isPending, disabled, workspaceFallback }: ScanButtonProps) {
  return (
    <div className="relative inline-flex">
      {isPending && (
        <span className="absolute inset-0 rounded-lg ring-2 ring-indigo-300/50 animate-pulse pointer-events-none" />
      )}
      <button
        onClick={onClick}
        disabled={disabled}
        title={workspaceFallback ? "Select a workspace first" : undefined}
        className="relative flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Zap size={14} />
        )}
        {isPending ? "Scanning..." : "Scan all"}
      </button>
    </div>
  );
}
