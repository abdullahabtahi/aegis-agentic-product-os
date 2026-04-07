"use client";

/**
 * useChatController — wraps useCopilotChatInternal (the AG-UI-aware internal hook)
 * and exposes a clean interface for the Home page.
 *
 * Background: useCopilotChat (public) destructures `visibleMessages` from the internal
 * return, but the internal hook now returns `messages` (AG-UI format) — so visibleMessages
 * is always undefined. Using useCopilotChatInternal directly gives us real AG-UI messages.
 */

import { useCallback } from "react";
import { useCopilotChatInternal } from "@copilotkit/react-core";
import { randomId } from "@copilotkit/shared";
import type { Message } from "@copilotkit/shared";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function extractContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text: unknown }).text);
        return "";
      })
      .join("");
  }
  return "";
}

function toDisplayMessage(m: Message): ChatMessage | null {
  if (m.role !== "user" && m.role !== "assistant") return null;
  const content = extractContent((m as { content?: unknown }).content);
  if (!content.trim()) return null;
  return { id: m.id, role: m.role as "user" | "assistant", content };
}

export function useChatController() {
  const { messages: rawMessages, sendMessage, isLoading, stopGeneration } =
    useCopilotChatInternal();

  const messages: ChatMessage[] = (rawMessages ?? [])
    .map(toDisplayMessage)
    .filter((m): m is ChatMessage => m !== null);

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) return;
      sendMessage({ id: randomId(), role: "user", content: text.trim() });
    },
    [sendMessage, isLoading],
  );

  return {
    messages,
    sendMessage: handleSend,
    isLoading,
    stopGeneration,
    hasMessages: messages.length > 0,
  };
}
