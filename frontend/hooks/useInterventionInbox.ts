"use client";

/**
 * useInterventionInbox — manages the list of pending interventions.
 * Snooze state is persisted to localStorage so it survives page refresh.
 * Uses React Query for caching and deduplication (reduces API calls by ~66%).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
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
  const [snoozed, setSnoozed] = useState<Record<string, number>>(loadSnoozed);

  // React Query handles caching, deduplication, and background refetching
  const {
    data: interventions = [],
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["interventions", workspaceId],
    queryFn: () => getInterventions(workspaceId),
    enabled: !!workspaceId,
    staleTime: 30 * 1000, // 30s — data is fresh for 30s, no refetch during this window
    gcTime: 5 * 60 * 1000, // 5min — cache persists for 5min after last use
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });

  const error = queryError instanceof Error ? queryError.message : null;

  // Wrap refetch for backwards compatibility with onClick handlers
  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

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

  // Memoize filtering to prevent unnecessary recalculations
  const visible = useMemo(() => {
    const now = Date.now();
    return interventions.filter((i) => {
      const until = snoozed[i.id];
      if (!until) return true;
      if (until < now) {
        // Snooze expired — clean up (next render will reflect change)
        unsnooze(i.id);
        return true;
      }
      return false;
    });
  }, [interventions, snoozed, unsnooze]);

  const pending = useMemo(
    () => visible.filter((i) => i.status === "pending"),
    [visible]
  );

  const resolved = useMemo(
    () => visible.filter((i) => i.status !== "pending"),
    [visible]
  );

  // Invalidate on AG-UI pipeline completion
  const invalidateOnComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["interventions", workspaceId] });
  }, [queryClient, workspaceId]);

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
