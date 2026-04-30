"use client";

import { Mic, MicOff, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface BoardroomControlsProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onEndSession: () => void;
  isEnding?: boolean;
}

export function BoardroomControls({
  isMuted,
  onToggleMute,
  onEndSession,
  isEnding = false,
}: BoardroomControlsProps) {
  return (
    <div className="flex items-center gap-3 rounded-full bg-gray-900/90 px-4 py-2 shadow-lg backdrop-blur-md">
      {/* Mute toggle — min 44×44px touch target */}
      <button
        onClick={onToggleMute}
        aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95",
          isMuted
            ? "bg-white/20 text-white ring-2 ring-white/40"
            : "bg-white/10 text-white hover:bg-white/20",
        )}
      >
        {isMuted ? <MicOff className="h-5 w-5 text-amber-400" /> : <Mic className="h-5 w-5" />}
      </button>

      {/* Divider */}
      <div className="h-5 w-px bg-white/20" />

      {/* End session */}
      <button
        onClick={onEndSession}
        disabled={isEnding}
        aria-label="End boardroom session"
        className={cn(
          "flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-all active:scale-95",
          isEnding
            ? "cursor-not-allowed bg-white/10 text-white/40"
            : "bg-red-500 text-white hover:bg-red-600",
        )}
      >
        <Square className="h-4 w-4 fill-current" />
        {isEnding ? "Ending…" : "End Session"}
      </button>
    </div>
  );
}
