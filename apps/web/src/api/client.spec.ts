import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, AuthRedirectingError, apiFetch, navigation } from "./client";

function mockFetchResponse(partial: Partial<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(partial as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(status: number, body: unknown): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    type: "basic",
    json: () => Promise.resolve(body),
  };
}

const opaqueRedirect: Partial<Response> = { ok: false, status: 0, type: "opaqueredirect" };

describe("apiFetch", () => {
  let assignSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sessionStorage.clear();
    assignSpy = vi.spyOn(navigation, "assign").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("正常なレスポンスはJSONを返す", async () => {
    mockFetchResponse(jsonResponse(200, { userId: "alice" }));
    await expect(apiFetch("/auth/me")).resolves.toEqual({ userId: "alice" });
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("redirect: manual かつ cache: no-store でfetchする(認証層の302の追跡・キャッシュ残留を防ぐ)", async () => {
    const fetchMock = mockFetchResponse(jsonResponse(200, {}));
    await apiFetch("/records");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/records",
      expect.objectContaining({ redirect: "manual", cache: "no-store" }),
    );
  });

  it("userInitiatedはfetchのオプションとして渡さない", async () => {
    const fetchMock = mockFetchResponse(jsonResponse(200, {}));
    await apiFetch("/auth/login", { method: "POST", userInitiated: true });
    const init = fetchMock.mock.calls[0][1] as Record<string, unknown>;
    expect(init).not.toHaveProperty("userInitiated");
  });

  it("opaqueredirect検出時は/api/auth/refreshへ遷移し、ユーザー向けメッセージでthrowする", async () => {
    mockFetchResponse(opaqueRedirect);
    await expect(apiFetch("/records")).rejects.toThrow(
      "ログインセッションの有効期限が切れました。再ログインしています…",
    );
    expect(assignSpy).toHaveBeenCalledExactlyOnceWith("/api/auth/refresh");
  });

  it("直近60秒以内にリダイレクト済みなら再遷移せず、再読み込みを促すメッセージでthrowする(SW未対応環境)", async () => {
    mockFetchResponse(opaqueRedirect);

    await expect(apiFetch("/records")).rejects.toThrow(
      "ログインセッションの有効期限が切れました。再ログインしています…",
    );
    await expect(apiFetch("/records")).rejects.toThrow(
      "認証状態を確認できませんでした。ページを再読み込みしてください",
    );
    expect(assignSpy).toHaveBeenCalledTimes(1);
  });

  it("リダイレクト直後に再びopaqueredirectを検出したらSWを解除してリロードする(自己修復)", async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    });
    const reloadSpy = vi.spyOn(navigation, "reload").mockImplementation(() => {});
    mockFetchResponse(opaqueRedirect);

    // 1回目は通常どおり/api/auth/refreshへ遷移
    const first = await apiFetch("/auth/me").catch((e: unknown) => e);
    expect(first).toBeInstanceOf(AuthRedirectingError);
    expect((first as ApiError).message).toBe("ログインセッションの有効期限が切れました。再ログインしています…");
    // 遷移から戻った直後(60秒以内)にまた検出=復帰フローが完走していない → SW解除+リロード
    const second = await apiFetch("/auth/me").catch((e: unknown) => e);
    expect(second).toBeInstanceOf(AuthRedirectingError);
    expect((second as ApiError).message).toBe("認証の復旧処理中です。ページを自動的に再読み込みします…");
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy).toHaveBeenCalledTimes(1);
  });

  it("直近5分以内にSWリセット試行済みなら再リセットせず、再読み込みを促すメッセージにする", async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    });
    const reloadSpy = vi.spyOn(navigation, "reload").mockImplementation(() => {});
    // スロットル有効+SWリセット試行済みの状態を作る
    sessionStorage.setItem("authRedirectAt", String(Date.now()));
    sessionStorage.setItem("authSwResetAt", String(Date.now()));
    mockFetchResponse(opaqueRedirect);

    const error = await apiFetch("/auth/me").catch((e: unknown) => e);
    // 遷移していないので、画面は「再ログイン中…」ではなく手動復旧を促すフォールバックにする
    expect(error).not.toBeInstanceOf(AuthRedirectingError);
    expect((error as ApiError).message).toBe("認証状態を確認できませんでした。ページを再読み込みしてください");
    expect(unregister).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("前回のリダイレクトから60秒経過していれば再度遷移する", async () => {
    vi.useFakeTimers();
    try {
      mockFetchResponse(opaqueRedirect);

      await expect(apiFetch("/records")).rejects.toThrow(ApiError);
      vi.advanceTimersByTime(60_001);
      await expect(apiFetch("/records")).rejects.toThrow(ApiError);
      expect(assignSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("userInitiated: trueなら直近60秒以内でもスロットルを無視して遷移する", async () => {
    mockFetchResponse(opaqueRedirect);

    // 1回目(起動時の自動fetch想定)で抑止間隔が始まる
    await expect(apiFetch("/auth/me")).rejects.toThrow(ApiError);
    // 直後のユーザー操作(ログインボタン押下)は抑止されず遷移する
    await expect(apiFetch("/auth/login", { method: "POST", userInitiated: true })).rejects.toThrow(
      "ログインセッションの有効期限が切れました。再ログインしています…",
    );
    expect(assignSpy).toHaveBeenCalledTimes(2);
  });

  it("リダイレクトなしの応答が返ると抑止間隔がリセットされ、次のopaqueredirectで即遷移する", async () => {
    // opaqueredirect → 抑止間隔開始
    mockFetchResponse(opaqueRedirect);
    await expect(apiFetch("/records")).rejects.toThrow(ApiError);
    expect(assignSpy).toHaveBeenCalledTimes(1);

    // 正常応答 → リセット
    mockFetchResponse(jsonResponse(200, {}));
    await apiFetch("/records");
    expect(sessionStorage.getItem("authRedirectAt")).toBeNull();

    // 再びopaqueredirect → 60秒待たず即遷移
    mockFetchResponse(opaqueRedirect);
    await expect(apiFetch("/records")).rejects.toThrow(ApiError);
    expect(assignSpy).toHaveBeenCalledTimes(2);
  });

  it("401などのエラー応答でも(リダイレクトではないので)抑止間隔はリセットされる", async () => {
    mockFetchResponse(opaqueRedirect);
    await expect(apiFetch("/records")).rejects.toThrow(ApiError);

    mockFetchResponse(jsonResponse(401, { error: "認証が必要です" }));
    await expect(apiFetch("/auth/me")).rejects.toThrow("認証が必要です");
    expect(sessionStorage.getItem("authRedirectAt")).toBeNull();
  });

  it("エラーレスポンスはbodyのerrorメッセージ付きでApiErrorをthrowする", async () => {
    mockFetchResponse(jsonResponse(401, { error: "認証が必要です" }));
    const error = await apiFetch("/auth/me").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).message).toBe("認証が必要です");
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("204は値なしで解決する", async () => {
    mockFetchResponse({ ok: true, status: 204, type: "basic" });
    await expect(apiFetch("/records/2026-07-06")).resolves.toBeUndefined();
  });
});
