"use client";

import { useState, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Send, Square, Plus } from "lucide-react";

interface CommandBarProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  onStop: () => void;
  placeholder?: string;
  disabled?: boolean;
  onNewDirection?: () => void;
  /** Renders with extra vertical padding to serve as the page focal point */
  hero?: boolean;
}

export interface CommandBarHandle {
  focus: () => void;
}

export const CommandBar = forwardRef<CommandBarHandle, CommandBarProps>(function CommandBar(
  {
    onSend,
    isLoading,
    onStop,
    placeholder = "Ask Aegis anything or trigger a scan...",
    disabled = false,
    onNewDirection,
    hero = false,
  }: CommandBarProps,
  ref
) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading || disabled) return;
    onSend(text);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  }, [input, isLoading, disabled, onSend]);

  return (
    <div
      className={`glass-input flex items-end gap-2 transition-all duration-200 ${
        hero ? "px-4 py-4" : "px-3 py-3"
      } ${
        focused
          ? "ring-2 ring-indigo-500/25 shadow-lg shadow-indigo-500/10 border-white/40"
          : "shadow-sm"
      }`}
    >
      {/* + New Direction */}
      {onNewDirection && (
        <button
          type="button"
          onClick={onNewDirection}
          disabled={disabled}
          title="Declare a new Direction"
          aria-label="Declare a new Direction"
          className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground/50 transition-all hover:bg-indigo-500/10 hover:text-indigo-500 disabled:opacity-30"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      )}

      <textarea
        ref={textareaRef}
        rows={1}
        value={input}
        onChange={handleInput}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder={placeholder}
        disabled={disabled || isLoading}
        className="flex-1 resize-none overflow-hidden bg-transparent py-1 px-2 text-sm text-foreground/90 placeholder:text-muted-foreground/55 focus:outline-none disabled:opacity-50 leading-relaxed"
        style={{ minHeight: "24px", maxHeight: "120px" }}
      />

      {isLoading ? (
        <button
          onClick={onStop}
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/80 text-white transition-colors hover:bg-destructive"
          title="Stop"
        >
          <Square size={14} />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25 transition-all hover:shadow-lg hover:shadow-indigo-500/35 hover:scale-105 disabled:opacity-30 disabled:shadow-none disabled:scale-100"
          title="Send"
        >
          <Send size={14} />
        </button>
      )}
    </div>
  );
});
