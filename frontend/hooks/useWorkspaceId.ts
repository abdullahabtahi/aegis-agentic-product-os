"use client";
import { useCoAgent } from "@copilotkit/react-core";
import type { AegisPipelineState } from "@/lib/types";

const FALLBACK = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID || "default_workspace";

export function useWorkspaceId(): string {
  const { state } = useCoAgent<AegisPipelineState>({ name: "aegis" });
  // Use || not ?? so an empty string also falls back (backend should never emit "")
  return state?.workspace_id || FALLBACK;
}
