import { apiFetch } from "./client";

export interface LinkRequestInfo {
  email: string;
  createdAt: string;
}

export interface LinkState {
  /** 自分が所有者のとき、参加しているメンバーのメール一覧 */
  members: string[];
  /** 自分が連携メンバーのとき、共有カレンダー所有者のメール(でなければ null) */
  owner: string | null;
  /** 自分宛の未承認申請(承認/却下できる) */
  incoming: LinkRequestInfo[];
  /** 自分が送った未承認申請(取消できる) */
  outgoing: LinkRequestInfo[];
}

/** 連携の全状態を取得する */
export function getLinkState(): Promise<LinkState> {
  return apiFetch("/links");
}

/** 相手(targetEmail)を自分のカレンダーに招く申請を送る */
export function sendLinkRequest(targetEmail: string): Promise<{ ok: true }> {
  return apiFetch("/links/requests", {
    method: "POST",
    body: JSON.stringify({ targetEmail }),
    userInitiated: true,
  });
}

/** 自分が送った申請を取り消す */
export function cancelLinkRequest(target: string): Promise<{ ok: true }> {
  return apiFetch(`/links/requests/${encodeURIComponent(target)}`, {
    method: "DELETE",
    userInitiated: true,
  });
}

/** 自分宛の申請を承認する(相手のカレンダーに参加する) */
export function acceptLinkRequest(requester: string): Promise<{ ok: true }> {
  return apiFetch(`/links/incoming/${encodeURIComponent(requester)}/accept`, {
    method: "POST",
    userInitiated: true,
  });
}

/** 自分宛の申請を却下する */
export function rejectLinkRequest(requester: string): Promise<{ ok: true }> {
  return apiFetch(`/links/incoming/${encodeURIComponent(requester)}/reject`, {
    method: "POST",
    userInitiated: true,
  });
}

/** 所有者として、参加中のメンバーを解除する */
export function removeMember(member: string): Promise<{ ok: true }> {
  return apiFetch(`/links/members/${encodeURIComponent(member)}`, {
    method: "DELETE",
    userInitiated: true,
  });
}

/** メンバーとして、自分の参加を解除して離脱する */
export function leaveLink(): Promise<{ ok: true }> {
  return apiFetch("/links/membership", {
    method: "DELETE",
    userInitiated: true,
  });
}
