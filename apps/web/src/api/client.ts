export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// 認証リダイレクトを検出してから再度トップレベル遷移を許可するまでの間隔。
// ログイン完了後もfetchが失敗し続ける異常時に、遷移の無限ループへ陥るのを防ぐ。
const AUTH_REDIRECT_MIN_INTERVAL_MS = 60_000;
const AUTH_REDIRECT_AT_KEY = "authRedirectAt";

// window.location.assignへの間接参照。jsdomではlocationのメソッドを直接モックできないため、
// テストから差し替えられるようにオブジェクト経由で呼ぶ。
export const navigation = {
  assign(url: string) {
    window.location.assign(url);
  },
};

/**
 * Cloudflare Accessのセッション切れを検出したときの処理。
 *
 * PWAのService Workerがアプリシェルをキャッシュから返すため、Accessのセッションが切れていても
 * SPAは起動してしまう。その状態でのfetchにはAccessがログインページ(クロスオリジン)への302を
 * 返し、リダイレクトを追跡するとCORSで「TypeError: Failed to fetch」になる。
 * そこでredirect: "manual"でリダイレクトをopaqueredirectとして検出し、/api/auth/refreshへ
 * トップレベル遷移することでAccess認証→トップページ復帰の流れに乗せる。
 */
function handleAuthRedirect(): never {
  const lastRedirectAt = Number(sessionStorage.getItem(AUTH_REDIRECT_AT_KEY) ?? "0");
  const now = Date.now();
  if (!Number.isFinite(lastRedirectAt) || now - lastRedirectAt >= AUTH_REDIRECT_MIN_INTERVAL_MS) {
    sessionStorage.setItem(AUTH_REDIRECT_AT_KEY, String(now));
    navigation.assign("/api/auth/refresh");
  }
  throw new ApiError(401, "ログインセッションの有効期限が切れました。再ログインしています…");
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    redirect: "manual",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  // APIは通常リダイレクトを返さないため、opaqueredirectは認証層(Cloudflare Access)による
  // ログインページへの302とみなす
  if (res.type === "opaqueredirect") {
    handleAuthRedirect();
  }

  if (!res.ok) {
    let message = `リクエストに失敗しました(status=${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // レスポンスボディがJSONでない場合は既定のメッセージを使う
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
