"use client";

/**
 * ChatMessages — Perplexity-style message feed.
 * User messages appear as clean question pills on the right.
 * Assistant messages appear as full glass cards on the left.
 */

import { useEffect, useRef } from "react";
import { Loader2, Shield } from "lucide-react";
import { PipelineProgressCard } from "./PipelineProgressCard";
import type { ChatMessage } from "@/hooks/useChatController";
import type { AegisPipelineState } from "@/lib/types";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  pipelineState?: AegisPipelineState;
}

export function ChatMessages({ messages, isLoading, pipelineState }: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const showPipeline =
    pipelineState?.pipeline_status &&
    pipelineState.pipeline_status !== "idle" &&
    pipelineState.pipeline_status !== "complete";

  return (
    <div className="flex flex-col gap-6">
      {messages.map((msg, i) => (
        <div key={msg.id}>
          {msg.role === "user" ? (
            /* User message — right-aligned question */
            <div className="flex justify-end">
              <div className="max-w-[75%] rounded-2xl bg-primary/90 px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm">
                {msg.content}
              </div>
            </div>
          ) : (
            /* Assistant message — full glass card */
            <div className="flex gap-3">
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15">
                <Shield size={16} className="text-indigo-500" />
              </div>
              <div className="glass-panel flex-1 p-5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                  {msg.content}
                </p>
              </div>
            </div>
          )}

          {/* Inline pipeline progress after the last user message */}
          {msg.role === "user" && showPipeline && i === messages.length - 1 && pipelineState && (
            <div className="mt-3 flex gap-3">
              <div className="w-8 shrink-0" />
              <div className="flex-1">
                <PipelineProgressCard
                  status={pipelineState.pipeline_status!}
                  currentStage={pipelineState.current_stage}
                  stages={pipelineState.stages}
                />
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Typing indicator */}
      {isLoading && (
        <div className="flex gap-3">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15">
            <Shield size={16} className="text-indigo-500" />
          </div>
          <div className="glass-panel-subtle flex items-center gap-2 rounded-2xl px-5 py-3">
            <Loader2 size={14} className="animate-spin text-indigo-500" />
            <span className="text-sm text-muted-foreground">Aegis is thinking...</span>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
