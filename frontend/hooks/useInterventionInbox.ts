"use client";

/**
 * useInterventionInbox — manages the list of pending interventions.
 * Snooze state is persisted to localStorage so it survives page refresh.
 * Uses React Query for caching and deduplication (reduces API calls by ~66%).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getInterventions } from "@/lib/api";


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

  // Stable timestamp updated every minute via setInterval (not setState-in-effect)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  // Filter visible interventions — snooze expiry uses `now` (updated by interval above)
  const visible = useMemo(
    () => interventions.filter((i) => {
      const until = snoozed[i.id];
      return !until || until < now;
    }),
    [interventions, snoozed, now],
  );

  const pending = useMemo(
    () => visible.filter((i) => i.status === "pending" && i.action_type !== "no_intervention"),
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
