import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, navigation } from "./client";

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

  it("redirect: manual でfetchする(認証層の302を追跡してCORSエラーになるのを防ぐ)", async () => {
    const fetchMock = mockFetchResponse(jsonResponse(200, {}));
    await apiFetch("/records");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/records",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("opaqueredirect検出時は/api/auth/refreshへ遷移し、ユーザー向けメッセージでthrowする", async () => {
    mockFetchResponse({ ok: false, status: 0, type: "opaqueredirect" });
    await expect(apiFetch("/records")).rejects.toThrow(
      "ログインセッションの有効期限が切れました。再ログインしています…",
    );
    expect(assignSpy).toHaveBeenCalledExactlyOnceWith("/api/auth/refresh");
  });

  it("直近60秒以内にリダイレクト済みなら再遷移せずエラーのみ(無限ループ防止)", async () => {
    mockFetchResponse({ ok: false, status: 0, type: "opaqueredirect" });

    await expect(apiFetch("/records")).rejects.toThrow(ApiError);
    await expect(apiFetch("/records")).rejects.toThrow(ApiError);
    expect(assignSpy).toHaveBeenCalledTimes(1);
  });

  it("前回のリダイレクトから60秒経過していれば再度遷移する", async () => {
    vi.useFakeTimers();
    try {
      mockFetchResponse({ ok: false, status: 0, type: "opaqueredirect" });

      await expect(apiFetch("/records")).rejects.toThrow(ApiError);
      vi.advanceTimersByTime(60_001);
      await expect(apiFetch("/records")).rejects.toThrow(ApiError);
      expect(assignSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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
