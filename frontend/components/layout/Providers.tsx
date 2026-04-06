"use client";

/**
 * Providers — wraps the app with CopilotKit + React Query providers.
 * SSE reconnect: onConnectionStatusChange invalidates all queries on reconnect.
 */

import { CopilotKit } from "@copilotkit/react-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRef } from "react";
import { BACKEND_URL } from "@/lib/constants";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // Stable QueryClient across renders
  const queryClientRef = useRef<QueryClient | null>(null);
  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        queries: {
          // No polling — delta-driven invalidation from AG-UI events
          staleTime: Infinity,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  const queryClient = queryClientRef.current;

  const handleConnectionStatus = (status: string) => {
    if (status === "connected") {
      // Re-invalidate after reconnect to catch any missed updates
      queryClient.invalidateQueries();
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <CopilotKit
        runtimeUrl={`${BACKEND_URL}/copilotkit`}
        onConnectionStatusChange={handleConnectionStatus}
      >
        {children}
      </CopilotKit>
    </QueryClientProvider>
  );
}
