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

  // Global error handler for CopilotKit connection/agent issues
  const handleCopilotError = (errorEvent: {
    type: string;
    timestamp: number;
    error?: any;
    context?: any;
  }) => {
    console.error('[CopilotKit Error]', {
      type: errorEvent.type,
      timestamp: errorEvent.timestamp,
      error: errorEvent.error,
      context: errorEvent.context,
    });

    const errorMessage = errorEvent.error?.message || String(errorEvent.error);

    // Check for common error patterns
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      console.error('[CopilotKit] Backend connection failed. Check:');
      console.error('  1. Backend server running on port 8000');
      console.error('  2. BACKEND_URL environment variable');
      console.error('  3. CORS configuration');
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      console.error('[CopilotKit] Request timeout. Backend agent may be slow or stuck.');
    }

    // Don't throw - let the app continue but show error in console
  };

  return (
    <QueryClientProvider client={queryClient}>
      {/* runtimeUrl points to the Next.js API route, which proxies to ag_ui_adk */}
      <CopilotKit
        runtimeUrl="/api/copilotkit"
        agent="aegis_pipeline"
        showDevConsole={true}
        onError={handleCopilotError}
      >
        {children}
      </CopilotKit>
    </QueryClientProvider>
  );
}
