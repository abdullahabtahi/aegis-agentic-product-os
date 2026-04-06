"use client";

/**
 * useInterventionInbox — manages the list of pending interventions.
 * Snooze state is persisted to localStorage so it survives page refresh.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { getInterventions } from "@/lib/api";
import type { Intervention } from "@/lib/types";

const SNOOZE_KEY = "aegis:snoozed_interventions";
const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadSnoozed(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveSnoozed(snoozed: Record<string, number>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(snoozed));
}

export function useInterventionInbox(workspaceId: string) {
  const queryClient = useQueryClient();
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [snoozed, setSnoozed] = useState<Record<string, number>>(loadSnoozed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getInterventions(workspaceId);
      setInterventions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interventions");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const snooze = useCallback((id: string) => {
    const until = Date.now() + SNOOZE_DURATION_MS;
    setSnoozed((prev) => {
      const next = { ...prev, [id]: until };
      saveSnoozed(next);
      return next;
    });
  }, []);

  const unsnooze = useCallback((id: string) => {
    setSnoozed((prev) => {
      const next = { ...prev };
      delete next[id];
      saveSnoozed(next);
      return next;
    });
  }, []);

  // Filter out expired snoozes and snoozed items
  const now = Date.now();
  const visible = interventions.filter((i) => {
    const until = snoozed[i.id];
    if (!until) return true;
    if (until < now) {
      // Snooze expired — clean up
      unsnooze(i.id);
      return true;
    }
    return false;
  });

  const pending = visible.filter((i) => i.status === "pending");
  const resolved = visible.filter((i) => i.status !== "pending");

  // Invalidate on AG-UI pipeline completion
  const invalidateOnComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["interventions", workspaceId] });
    refresh();
  }, [queryClient, workspaceId, refresh]);

  return {
    pending,
    resolved,
    loading,
    error,
    snooze,
    unsnooze,
    refresh,
    invalidateOnComplete,
  };
}
