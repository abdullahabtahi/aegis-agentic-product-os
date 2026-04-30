"use client";

import { motion, type Variants } from "framer-motion";
import { Brain } from "lucide-react";

interface DeliberatingOverlayProps {
  visible: boolean;
}

const DOT_VARIANTS: Variants = {
  animate: (i: number) => ({
    scale: [1, 1.4, 1],
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 1.2,
      repeat: Infinity,
      delay: i * 0.3,
      ease: "easeInOut" as const,
    },
  }),
};

export function DeliberatingOverlay({ visible }: DeliberatingOverlayProps) {
  if (!visible) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center"
      style={{ backdropFilter: "blur(20px)", backgroundColor: "rgba(249,249,255,0.85)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring" as const, stiffness: 260, damping: 22 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
          <Brain className="h-8 w-8 text-indigo-600" />
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900">Advisors deliberating</h2>
          <p className="mt-1 text-sm text-gray-500">Synthesising your session into a verdict…</p>
        </div>

        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              custom={i}
              variants={DOT_VARIANTS}
              animate="animate"
              className="h-2 w-2 rounded-full bg-indigo-500"
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
