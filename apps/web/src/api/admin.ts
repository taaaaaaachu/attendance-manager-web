import type { AdminUserDetail, AdminUserSummary } from "@attendance/shared";
import type { AgentConnection } from "./agentConnections";
import { apiFetch } from "./client";

export async function getAdminUsers(offsetMonths = 0): Promise<AdminUserSummary[]> {
  const { users } = await apiFetch<{ users: AdminUserSummary[] }>(
    `/admin/users?offsetMonths=${offsetMonths}`,
  );
  return users;
}

export function getAdminUserDetail(userId: string, offsetMonths = 0): Promise<AdminUserDetail> {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/records?offsetMonths=${offsetMonths}`);
}

/** 全ユーザーのエージェント接続 */
export async function getAdminAgentConnections(): Promise<AgentConnection[]> {
  return (await apiFetch<{ connections: AgentConnection[] }>("/admin/agent-connections")).connections;
}

/** 任意のユーザーのエージェント接続を取り消す */
export function revokeAdminAgentConnection(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/agent-connections/${encodeURIComponent(id)}`, { method: "DELETE", userInitiated: true });
}

export function deleteAdminUser(userId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE", userInitiated: true });
}
