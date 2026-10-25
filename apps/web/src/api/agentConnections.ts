import { apiFetch } from "./client";

export interface AgentConnection {
  id: string;
  userEmail: string;
  name: string;
  /** oauth: エージェントの同意画面から作ったもの、manual: 手動発行のトークン */
  kind: "oauth" | "manual";
  /** 一覧での見分け方(手動発行・接続元のドメイン) */
  origin: string;
  createdAt: string;
  lastUsedAt: string;
}

/** 自分のエージェント接続の一覧 */
export async function listAgentConnections(): Promise<AgentConnection[]> {
  return (await apiFetch<{ connections: AgentConnection[] }>("/agent-connections")).connections;
}

/** トークンを手動発行する。トークンはこの戻り値でしか分からない */
export function issueAgentToken(name: string): Promise<{ id: string; token: string }> {
  return apiFetch("/agent-connections", {
    method: "POST",
    body: JSON.stringify({ name }),
    userInitiated: true,
  });
}

/** 自分の接続を取り消す */
export function revokeAgentConnection(id: string): Promise<{ ok: true }> {
  return apiFetch(`/agent-connections/${encodeURIComponent(id)}`, {
    method: "DELETE",
    userInitiated: true,
  });
}
