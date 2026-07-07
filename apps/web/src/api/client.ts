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

// SWリセット(自己修復)の再試行間隔。リセット→リロード後も直らない異常時に
// リロードの無限ループへ陥るのを防ぐ。
const SW_RESET_MIN_INTERVAL_MS = 5 * 60_000;
const SW_RESET_AT_KEY = "authSwResetAt";

// window.locationのメソッドへの間接参照。jsdomではlocationのメソッドを直接モックできないため、
// テストから差し替えられるようにオブジェクト経由で呼ぶ。
export const navigation = {
  assign(url: string) {
    window.location.assign(url);
  },
  reload() {
    window.location.reload();
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
/**
 * 認証リダイレクトへ遷移した直後にもかかわらず再びopaqueredirectを検出したときの自己修復。
 *
 * 旧Service Workerが認証コールバック(/cdn-cgi/access/authorized)を横取りする等で
 * Access認証が完走できないと、SWスクリプトの更新自体もAccessの302でブロックされ、
 * 手動のスーパーリロード以外に復旧手段がなくなる(2026-07-08に本番で発生)。
 * SWを解除してリロードすれば、SWなしの読み込みで認証フローがネットワークに到達して
 * 復旧でき、その後アプリ起動時にSWは再登録される。
 */
async function tryRecoverByResettingServiceWorker(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) {
    return false;
  }
  const lastResetAt = Number(sessionStorage.getItem(SW_RESET_AT_KEY) ?? "0");
  const now = Date.now();
  if (Number.isFinite(lastResetAt) && now - lastResetAt < SW_RESET_MIN_INTERVAL_MS) {
    return false;
  }
  sessionStorage.setItem(SW_RESET_AT_KEY, String(now));
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  navigation.reload();
  return true;
}

async function handleAuthRedirect(userInitiated: boolean): Promise<never> {
  const lastRedirectAt = Number(sessionStorage.getItem(AUTH_REDIRECT_AT_KEY) ?? "0");
  const now = Date.now();
  const throttled =
    Number.isFinite(lastRedirectAt) && now - lastRedirectAt < AUTH_REDIRECT_MIN_INTERVAL_MS;

  if (userInitiated || !throttled) {
    sessionStorage.setItem(AUTH_REDIRECT_AT_KEY, String(now));
    navigation.assign("/api/auth/refresh");
    throw new ApiError(401, "ログインセッションの有効期限が切れました。再ログインしています…");
  }

  // 遷移直後なのに再びリダイレクトされた=認証復帰フローが完走できていない。SWの解除を試みる
  if (await tryRecoverByResettingServiceWorker()) {
    throw new ApiError(401, "認証の復旧処理中です。ページを自動的に再読み込みします…");
  }

  // 自己修復も直近に試行済み。進行中を装うメッセージは出さず、手動での復旧を促す
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
    await handleAuthRedirect(userInitiated);
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
