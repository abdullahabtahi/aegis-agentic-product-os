/**
 * Aegis REST API client — thin wrappers over fetch.
 * AG-UI streaming is handled by CopilotKit; these are for REST polling.
 */

import { BACKEND_URL } from "./constants";
import type { Intervention, SessionSummary, ArtifactEntry } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export function getInterventions(workspaceId: string): Promise<Intervention[]> {
  return request<Intervention[]>(`/interventions?workspace_id=${workspaceId}`);
}

export function approveIntervention(
  interventionId: string,
): Promise<{ status: string }> {
  return request(`/interventions/${interventionId}/approve`, { method: "POST" });
}

export function rejectIntervention(
  interventionId: string,
  reason?: string,
): Promise<{ status: string }> {
  return request(`/interventions/${interventionId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// ─── Session & Artifact endpoints ───

export function getSessions(
  userId = "default_user",
): Promise<SessionSummary[]> {
  return request<SessionSummary[]>(`/sessions?user_id=${encodeURIComponent(userId)}`);
}

export function getArtifacts(
  userId = "default_user",
  sessionId?: string,
): Promise<ArtifactEntry[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (sessionId) params.set("session_id", sessionId);
  return request<ArtifactEntry[]>(`/artifacts?${params}`);
}

export function getArtifactUrl(
  filename: string,
  userId = "default_user",
  sessionId?: string,
  version?: number,
): string {
  const params = new URLSearchParams({ user_id: userId });
  if (sessionId) params.set("session_id", sessionId);
  if (version != null) params.set("version", String(version));
  return `${BACKEND_URL}/artifacts/${encodeURIComponent(filename)}?${params}`;
}
