export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// 認証リダイレクトを検出してから再度トップレベル遷移を許可するまでの間隔。
// ログイン完了後もfetchが失敗し続ける異常時に、遷移の無限ループへ陥るのを防ぐ。
// ユーザー操作起点のリクエスト(userInitiated)はループの心配がないため抑止対象外。
const AUTH_REDIRECT_MIN_INTERVAL_MS = 60_000;
const AUTH_REDIRECT_AT_KEY = "authRedirectAt";

// window.location.assignへの間接参照。jsdomではlocationのメソッドを直接モックできないため、
// テストから差し替えられるようにオブジェクト経由で呼ぶ。
export const navigation = {
  assign(url: string) {
    window.location.assign(url);
  },
};

export interface ApiFetchInit extends RequestInit {
  /**
   * ユーザー操作(ログインボタン押下など)起点のリクエストならtrue。
   * 認証リダイレクト検出時にループ防止の抑止間隔を無視して即座に再認証へ遷移する。
   */
  userInitiated?: boolean;
}

/**
 * Cloudflare Accessのセッション切れを検出したときの処理。
 *
 * PWAのService Workerがアプリシェルをキャッシュから返すため、Accessのセッションが切れていても
 * SPAは起動してしまう。その状態でのfetchにはAccessがログインページ(クロスオリジン)への302を
 * 返し、リダイレクトを追跡するとCORSで「TypeError: Failed to fetch」になる。
 * そこでredirect: "manual"でリダイレクトをopaqueredirectとして検出し、/api/auth/refreshへ
 * トップレベル遷移することでAccess認証→トップページ復帰の流れに乗せる。
 */
function handleAuthRedirect(userInitiated: boolean): never {
  const lastRedirectAt = Number(sessionStorage.getItem(AUTH_REDIRECT_AT_KEY) ?? "0");
  const now = Date.now();
  const throttled =
    Number.isFinite(lastRedirectAt) && now - lastRedirectAt < AUTH_REDIRECT_MIN_INTERVAL_MS;

  if (userInitiated || !throttled) {
    sessionStorage.setItem(AUTH_REDIRECT_AT_KEY, String(now));
    navigation.assign("/api/auth/refresh");
    throw new ApiError(401, "ログインセッションの有効期限が切れました。再ログインしています…");
  }

  // 直近に遷移済みで抑止中は遷移しない。進行中を装うメッセージは出さず、手動での復旧を促す
  throw new ApiError(401, "認証状態を確認できませんでした。ページを再読み込みしてください");
}

export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const { userInitiated = false, ...requestInit } = init ?? {};
  const res = await fetch(`/api${path}`, {
    ...requestInit,
    credentials: "include",
    redirect: "manual",
    // 認証層(Cloudflare Access)の302などがHTTPキャッシュに残って返り続けると、
    // セッション復活後もopaqueredirect扱いで詰まるため、キャッシュを読み書きしない
    cache: "no-store",
    headers: {
      ...(requestInit.body ? { "Content-Type": "application/json" } : {}),
      ...requestInit.headers,
    },
  });

  // APIは通常リダイレクトを返さないため、opaqueredirectは認証層(Cloudflare Access)による
  // ログインページへの302とみなす
  if (res.type === "opaqueredirect") {
    handleAuthRedirect(userInitiated);
  }

  // リダイレクトなしで応答が返った=認証層は正常なので、抑止間隔をリセットして
  // 次にセッションが切れたとき即座に再認証へ遷移できるようにする
  sessionStorage.removeItem(AUTH_REDIRECT_AT_KEY);

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
