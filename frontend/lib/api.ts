/**
 * Aegis REST API client — thin wrappers over fetch.
 * AG-UI streaming is handled by CopilotKit; these are for REST polling.
 */

import { BACKEND_URL } from "./constants";
import type { Bet, Intervention, SessionSummary, ArtifactEntry, DiscoverBetsResponse, ControlLevel, RiskType, AcknowledgedRisk, SuppressionRule, KillCriteriaAction } from "./types";

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
  kill_criteria?: {
    condition: string;
    deadline: string;
    committed_action: KillCriteriaAction;
    status: "pending";
  } | null;
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

// ─── Workspace ───

export interface WorkspaceMeta {
  id: string;
  control_level: ControlLevel;
}

export function getWorkspace(workspaceId: string): Promise<WorkspaceMeta> {
  return request<WorkspaceMeta>(`/workspace/${encodeURIComponent(workspaceId)}`);
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

// ─── Bet mutations ───

export function updateBet(betId: string, body: Partial<BetCreateRequest>): Promise<Bet> {
  return request<Bet>(`/bets/${encodeURIComponent(betId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function archiveBet(betId: string): Promise<{ status: string; bet_id: string }> {
  return request<{ status: string; bet_id: string }>(`/bets/${encodeURIComponent(betId)}/archive`, {
    method: "POST",
  });
}

// ─── Workspace mutations ───

export function updateWorkspaceControlLevel(
  workspaceId: string,
  controlLevel: ControlLevel,
): Promise<WorkspaceMeta> {
  return request<WorkspaceMeta>(`/workspace/${encodeURIComponent(workspaceId)}`, {
    method: "PATCH",
    body: JSON.stringify({ control_level: controlLevel }),
  });
}

// ─── Acknowledged risks ───

export interface AcknowledgedRiskRequest {
  risk_type: RiskType;
  founder_note?: string;
}

export function addAcknowledgedRisk(
  betId: string,
  body: AcknowledgedRiskRequest,
): Promise<AcknowledgedRisk[]> {
  return request<AcknowledgedRisk[]>(`/bets/${encodeURIComponent(betId)}/acknowledged-risks`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function removeAcknowledgedRisk(
  betId: string,
  riskType: RiskType,
): Promise<AcknowledgedRisk[]> {
  return request<AcknowledgedRisk[]>(
    `/bets/${encodeURIComponent(betId)}/acknowledged-risks/${encodeURIComponent(riskType)}`,
    { method: "DELETE" },
  );
}

// ─── Suppression rules ───

export function getSuppressionRules(workspaceId: string): Promise<SuppressionRule[]> {
  return request<SuppressionRule[]>(`/suppression-rules?workspace_id=${encodeURIComponent(workspaceId)}`);
}

export function deleteSuppressionRule(ruleId: string): Promise<{ deleted: string }> {
  return request<{ deleted: string }>(`/suppression-rules/${encodeURIComponent(ruleId)}`, {
    method: "DELETE",
  });
}
