/**
 * Aegis REST API client — thin wrappers over fetch.
 * AG-UI streaming is handled by CopilotKit; these are for REST polling.
 */

import { BACKEND_URL } from "./constants";
import type { Bet, Intervention, SessionSummary, ArtifactEntry, DiscoverBetsResponse } from "./types";

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

// ─── Bets (Phase 6 — Bet Declaration) ───

export interface BetCreateRequest {
  workspace_id: string;
  name: string;
  target_segment: string;
  problem_statement: string;
  hypothesis?: string;
  success_metrics?: Array<{ name: string; target_value: string; unit: string }>;
  time_horizon?: string;
  linear_project_ids?: string[];
}

export function createBet(body: BetCreateRequest): Promise<Record<string, unknown>> {
  return request("/bets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listBets(workspaceId: string, status?: string): Promise<Bet[]> {
  const params = new URLSearchParams({ workspace_id: workspaceId });
  if (status) params.set("status", status);
  return request<Bet[]>(`/bets?${params}`);
}

export function getBet(betId: string): Promise<Bet> {
  return request<Bet>(`/bets/${encodeURIComponent(betId)}`);
}

export function getInterventionsByBet(workspaceId: string, betId: string): Promise<Intervention[]> {
  return request<Intervention[]>(`/interventions?workspace_id=${workspaceId}&bet_id=${encodeURIComponent(betId)}`);
}

// ─── Bet Discovery ───

export function discoverBets(workspaceId: string): Promise<DiscoverBetsResponse> {
  return request<DiscoverBetsResponse>("/bets/discover", {
    method: "POST",
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
}

// ─── Session messages (for history restoration) ───

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function getSessionMessages(
  sessionId: string,
  userId = "default_user",
): Promise<SessionMessage[]> {
  return request<SessionMessage[]>(
    `/sessions/${encodeURIComponent(sessionId)}/messages?user_id=${encodeURIComponent(userId)}`,
  );
}
