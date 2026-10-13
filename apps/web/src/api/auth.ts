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

/**
 * Access再認証へトップレベル遷移する(認証切れ画面の再読み込みボタン用)。
 * location.reload()だとService Workerがキャッシュ済みアプリシェルを返してAccessに到達せず、
 * apiFetchの自動遷移の抑止間隔中は同じ画面に戻るだけになるため、SW対象外の/api/へ直接遷移する。
 */
export function reauthenticate(): void {
  navigation.assign("/api/auth/refresh");
}
