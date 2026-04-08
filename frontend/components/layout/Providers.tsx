"use client";

/**
 * Providers — wraps the app with CopilotKit + React Query providers.
 * SSE reconnect is handled at the hook level via useCoAgent error boundaries.
 */

import { CopilotKit } from "@copilotkit/react-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface ProvidersProps {
  children: React.ReactNode;
}

function CopilotKitWithSession({
  children,
  onError,
}: {
  children: React.ReactNode;
  onError: Parameters<typeof CopilotKit>[0]["onError"];
}) {
  const searchParams = useSearchParams();
  const threadId = searchParams.get("session") ?? undefined;

  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="aegis_pipeline"
      threadId={threadId}
      showDevConsole={process.env.NODE_ENV === "development"}
      onError={onError}
    >
      {children}
    </CopilotKit>
  );
}

export function Providers({ children }: ProvidersProps) {
  // Stable QueryClient across renders — lazy initializer runs exactly once
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // No polling — delta-driven invalidation from AG-UI events
            staleTime: Infinity,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // Global error handler for CopilotKit connection/agent issues
  const handleCopilotError = (errorEvent: {
    type: string;
    timestamp: number;
    error?: unknown;
    context?: unknown;
  }) => {
    console.error('[CopilotKit Error]', {
      type: errorEvent.type,
      timestamp: errorEvent.timestamp,
      error: errorEvent.error,
      context: errorEvent.context,
    });

    const err = errorEvent.error;
    const errorMessage = err instanceof Error ? err.message : String(err ?? "");

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
      {/* Suspense required because useSearchParams() suspends during SSR */}
      <Suspense fallback={null}>
        <CopilotKitWithSession onError={handleCopilotError}>
          {children}
        </CopilotKitWithSession>
      </Suspense>
    </QueryClientProvider>
  );
}
