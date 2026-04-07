"use client";

/**
 * CommandBar — Pure glassmorphic input bar.
 * State is owned by the parent (Home page via useChatController).
 */

import { useState, useRef, useCallback } from "react";
import { Send, Loader2, Square } from "lucide-react";

interface CommandBarProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  onStop: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function CommandBar({
  onSend,
  isLoading,
  onStop,
  placeholder = "Ask Aegis anything or trigger a scan...",
  disabled = false,
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
    <div className="glass-input flex items-center gap-3 px-5 py-3">
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
        placeholder={placeholder}
        disabled={disabled || isLoading}
        className="flex-1 bg-transparent text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
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
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      )}
    </div>
  );
}
