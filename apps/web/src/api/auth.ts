import { apiFetch, navigation } from "./client";

export interface CurrentUser {
  userId: string;
  email: string | null;
  isAdmin: boolean;
  /** 連携メンバーとしてログイン中なら共有カレンダー所有者のメール、そうでなければ null */
  linkedTo: string | null;
  /** 自分宛の未承認の連携申請の件数(設定ボタンのバッジ用) */
  incomingRequestCount: number;
}

/** Cloudflare Accessで認証済みのユーザー情報(メールアドレス)を取得する */
export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiFetch("/auth/me");
}

/**
 * ログアウト。認証はCloudflare Accessに一本化されているため、
 * Accessのログアウトエンドポイントへトップレベル遷移する。
 */
export function logout(): void {
  navigation.assign("/cdn-cgi/access/logout");
}
