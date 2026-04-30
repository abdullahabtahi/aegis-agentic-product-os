"use client";

/**
 * useBackendHealth — pings /health on mount to surface backend connectivity
 * issues visibly in the UI instead of silent failures.
 */

import { useEffect, useState } from "react";
import { BACKEND_URL } from "@/lib/constants";

type HealthStatus = "checking" | "online" | "offline";

export function useBackendHealth(): HealthStatus {
  const [status, setStatus] = useState<HealthStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      fetch(`${BACKEND_URL}/debug/ping`, { signal: AbortSignal.timeout(4000) })
        .then((r) => {
          if (!cancelled) setStatus(r.ok ? "online" : "offline");
        })
        .catch(() => {
          if (!cancelled) setStatus("offline");
        });
    };

    check();
    // Retry every 5 s so the banner clears automatically when the backend boots
    const interval = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return status;
}
