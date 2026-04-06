"use client";

/**
 * Providers — wraps the app with CopilotKit + React Query providers.
 * SSE reconnect is handled at the hook level via useCoAgent error boundaries.
 */

import { CopilotKit } from "@copilotkit/react-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRef } from "react";

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

  return (
    <QueryClientProvider client={queryClient}>
      {/* runtimeUrl points to the Next.js API route, which proxies to ag_ui_adk */}
      <CopilotKit runtimeUrl="/api/copilotkit" agent="aegis_pipeline" showDevConsole={false}>
        {children}
      </CopilotKit>
    </QueryClientProvider>
  );
}
