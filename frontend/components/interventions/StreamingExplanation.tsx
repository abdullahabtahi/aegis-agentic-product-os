"use client";

/**
 * StreamingExplanation — isolated component for rendering streaming rationale.
 * Isolation prevents cascading re-renders on parent cards (PR #1 req #9).
 */

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface StreamingExplanationProps {
  text: string;
  isStreaming?: boolean;
}

export const StreamingExplanation = memo(function StreamingExplanation({
  text,
  isStreaming = false,
}: StreamingExplanationProps) {
  return (
    <div className="text-[12px] text-white/60 leading-relaxed">
      {text}
      <AnimatePresence>
        {isStreaming && (
          <motion.span
            className="inline-block w-1.5 h-3.5 bg-[#4F7EFF] ml-0.5 align-text-bottom rounded-sm"
            initial={{ opacity: 1 }}
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}
      </AnimatePresence>
    </div>
  );
});
