"use client";

/**
 * useInterventionApproval — server-confirmed accept/reject.
 *
 * NO optimistic status mutation. The UI shows a loading spinner while the
 * request is in-flight. The cache is only updated after the server confirms
 * the execution succeeded (onSuccess/onSettled). This prevents the "silent
 * failure" scenario where the UI shows "Accepted" but Linear never received
 * the write.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approveIntervention, rejectIntervention } from "@/lib/api";

export function useInterventionApproval(workspaceId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["interventions", workspaceId];

  const approve = useMutation({
    mutationFn: (id: string) => approveIntervention(id),

    // No onMutate optimistic update — wait for server confirmation.
    // isPending on the mutation drives the loading spinner in ApprovalCard.

    onSettled: () => {
      // Re-fetch the real server state after success or failure.
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      rejectIntervention(id, reason),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return { approve, reject };
}
