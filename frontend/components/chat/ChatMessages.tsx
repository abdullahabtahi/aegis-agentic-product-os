"use client";

/**
 * ChatMessages — Perplexity-style message feed.
 * User messages appear as clean question pills on the right.
 * Assistant messages appear as full glass cards on the left.
 * Markdown rendered via react-markdown + remark-gfm.
 */

import { useEffect, useRef } from "react";
import { Loader2, Shield, History } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PipelineProgressCard } from "./PipelineProgressCard";
import type { ChatMessage } from "@/hooks/useChatController";
import type { AegisPipelineState } from "@/lib/types";
import type { SessionMessage } from "@/lib/api";

/** Markdown component map — styled to match glassmorphic design system. */
const MD_COMPONENTS: React.ComponentProps<typeof Markdown>["components"] = {
  p: ({ children }) => (
    <p className="mb-2 text-sm leading-relaxed text-foreground/85 last:mb-0">{children}</p>
  ),
  h1: ({ children }) => (
    <h1 className="mb-2 font-heading text-base font-semibold text-foreground/90">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 font-heading text-sm font-semibold text-foreground/90">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 font-heading text-sm font-medium text-foreground/85">{children}</h3>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-4 text-sm text-foreground/85">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-4 text-sm text-foreground/85">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground/95">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
  code: ({ children, className }) => {
    const isBlock = className?.startsWith("language-");
    return isBlock ? (
      <code className={`block w-full font-mono text-xs ${className ?? ""}`}>{children}</code>
    ) : (
      <code className="rounded bg-white/30 px-1.5 py-0.5 font-mono text-xs text-indigo-700">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-xl bg-white/20 p-3 text-xs">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-indigo-400/50 pl-3 text-sm italic text-foreground/70">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-3 border-white/20" />,
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-white/20 bg-white/20 px-3 py-1.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-white/20 px-3 py-1.5">{children}</td>
  ),
};

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  pipelineState?: AegisPipelineState;
  restoredMessages?: SessionMessage[];
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl bg-primary/90 px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15">
        <Shield size={16} className="text-indigo-500" />
      </div>
      <div className="glass-panel flex-1 p-5">
        <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
          {content}
        </Markdown>
      </div>
    </div>
  );
}

export function ChatMessages({ messages, isLoading, pipelineState, restoredMessages }: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const showPipeline =
    pipelineState?.pipeline_status &&
    pipelineState.pipeline_status !== "idle" &&
    pipelineState.pipeline_status !== "complete";

  const hasRestored = restoredMessages && restoredMessages.length > 0;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Restored history from prior session ── */}
      {hasRestored && (
        <>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200/60" />
            <span className="flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1 text-xs font-medium text-slate-500">
              <History size={11} />
              Prior session
            </span>
            <div className="h-px flex-1 bg-slate-200/60" />
          </div>
          {restoredMessages.map((msg) => (
            <div key={msg.id} className="opacity-70">
              <MessageBubble role={msg.role} content={msg.content} />
            </div>
          ))}
          {messages.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-indigo-200/60" />
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
                Continuing session
              </span>
              <div className="h-px flex-1 bg-indigo-200/60" />
            </div>
          )}
        </>
      )}

      {messages.map((msg, i) => (
        <div key={msg.id}>
          <MessageBubble role={msg.role} content={msg.content} />

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
