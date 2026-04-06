"use client";

/**
 * useInterventionApproval — optimistic accept/reject with rollback.
 * Implements PR #1 req #10: useMutation with onMutate/onError/onSettled.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approveIntervention, rejectIntervention } from "@/lib/api";
import type { Intervention } from "@/lib/types";

type MutationContext = {
  previousInterventions: Intervention[] | undefined;
  interventionId: string;
};

export function useInterventionApproval(workspaceId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["interventions", workspaceId];

  const approve = useMutation({
    mutationFn: (id: string) => approveIntervention(id),

    onMutate: async (id): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Intervention[]>(queryKey);

      // Optimistic update: mark as accepted immediately
      queryClient.setQueryData<Intervention[]>(queryKey, (old) =>
        old?.map((i) =>
          i.id === id ? { ...i, status: "accepted" as const } : i,
        ),
      );

      return { previousInterventions: previous, interventionId: id };
    },

    onError: (_err, _id, context) => {
      if (context?.previousInterventions) {
        queryClient.setQueryData(queryKey, context.previousInterventions);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      rejectIntervention(id, reason),

    onMutate: async ({ id }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Intervention[]>(queryKey);

      queryClient.setQueryData<Intervention[]>(queryKey, (old) =>
        old?.map((i) =>
          i.id === id ? { ...i, status: "rejected" as const } : i,
        ),
      );

      return { previousInterventions: previous, interventionId: id };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousInterventions) {
        queryClient.setQueryData(queryKey, context.previousInterventions);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return { approve, reject };
}
