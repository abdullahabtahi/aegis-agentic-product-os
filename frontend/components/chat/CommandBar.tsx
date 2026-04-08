"use client";

/**
 * CommandBar — Pure glassmorphic input bar.
 * State is owned by the parent (Home page via useChatController).
 *
 * onNewDirection (optional): renders a small + button left of the input —
 * the Perplexity/ChatGPT pattern for attaching context before sending.
 * Only passed in hero mode (before first message).
 */

import { useState, useRef, useCallback } from "react";
import { Send, Square, Plus } from "lucide-react";

interface CommandBarProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  onStop: () => void;
  placeholder?: string;
  disabled?: boolean;
  onNewDirection?: () => void;
}

export function CommandBar({
  onSend,
  isLoading,
  onStop,
  placeholder = "Ask Aegis anything or trigger a scan...",
  disabled = false,
  onNewDirection,
}: CommandBarProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading || disabled) return;
    onSend(text);
    setInput("");
    inputRef.current?.focus();
  }, [input, isLoading, disabled, onSend]);

  return (
    <div className="glass-input flex items-center gap-2 px-3 py-3">
      {/* + New Direction — left-side action, Perplexity/ChatGPT pattern */}
      {onNewDirection && (
        <button
          type="button"
          onClick={onNewDirection}
          disabled={disabled}
          title="Declare a new Direction"
          aria-label="Declare a new Direction"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition-all hover:bg-indigo-500/10 hover:text-indigo-500 disabled:opacity-30"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      )}

      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
        placeholder={placeholder}
        disabled={disabled || isLoading}
        className="flex-1 bg-transparent px-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
      />

      {isLoading ? (
        <button
          onClick={onStop}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/80 text-white transition-colors hover:bg-destructive"
          title="Stop"
        >
          <Square size={14} />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-30"
          title="Send"
        >
          <Send size={14} />
        </button>
      )}
    </div>
  );
}
