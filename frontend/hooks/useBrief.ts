import { useQuery } from "@tanstack/react-query";
import { BACKEND_URL } from "@/lib/constants";
import { type FounderBrief } from "@/lib/types";

async function fetchBrief(workspaceId: string): Promise<FounderBrief> {
  const res = await fetch(
    `${BACKEND_URL}/brief?workspace_id=${encodeURIComponent(workspaceId)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Brief fetch failed: ${res.status}`);
  return res.json() as Promise<FounderBrief>;
}

export function useBrief(workspaceId: string | null) {
  return useQuery<FounderBrief>({
    queryKey: ["brief", workspaceId],
    queryFn: () => fetchBrief(workspaceId!),
    staleTime: 60 * 60 * 1000, // 1 hour
    enabled: !!workspaceId,
  });
}
