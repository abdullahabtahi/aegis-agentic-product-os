"use client";

import { useTransform, motion, type MotionValue } from "framer-motion";
import { MicOff } from "lucide-react";

interface BoardroomUserPiPProps {
  micLevelMV: MotionValue<number>;
  isMuted: boolean;
  latestCaption?: string;
}

const BAR_COUNT = 12;

export function BoardroomUserPiP({
  micLevelMV,
  isMuted,
  latestCaption,
}: BoardroomUserPiPProps) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center rounded-2xl bg-white/60 backdrop-blur-xl border border-white/50 shadow-sm overflow-hidden">
      {/* YOU label — top-left per spec */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5">
        <span className="rounded-full bg-gray-900/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.15em] text-white">
          You
        </span>
        {isMuted && (
          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
            <MicOff className="h-3 w-3" />
            Muted
          </span>
        )}
      </div>

      {/* Waveform visualizer */}
      <WaveformBars micLevelMV={micLevelMV} isMuted={isMuted} />

      {/* Live caption */}
      {latestCaption && (
        <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-white/80 px-3 py-2 text-xs text-gray-700 backdrop-blur-md shadow-sm">
          {latestCaption}
        </div>
      )}
    </div>
  );
}

function WaveformBars({ micLevelMV, isMuted }: { micLevelMV: MotionValue<number>; isMuted: boolean }) {
  return (
    <div className="flex items-center gap-1 h-20">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <WaveBar key={i} index={i} micLevelMV={micLevelMV} isMuted={isMuted} />
      ))}
    </div>
  );
}

function WaveBar({
  index,
  micLevelMV,
  isMuted,
}: {
  index: number;
  micLevelMV: MotionValue<number>;
  isMuted: boolean;
}) {
  const offset = Math.sin((index / BAR_COUNT) * Math.PI);
  const maxH = 20 + offset * 60;

  const height = useTransform(micLevelMV, (level) => {
    if (isMuted) return 4;
    const h = 4 + level * maxH * (0.6 + Math.sin(index * 1.3) * 0.4);
    return Math.max(4, Math.min(maxH, h));
  });

  return (
    <motion.div
      className="w-1.5 rounded-full bg-indigo-400"
      style={{ height }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    />
  );
}
