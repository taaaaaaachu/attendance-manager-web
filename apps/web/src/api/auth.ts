import { apiFetch, navigation } from "./client";

export interface CurrentUser {
  userId: string;
  email: string | null;
  isAdmin: boolean;
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
