import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login, logout, register } from "./auth";
import { navigation } from "./client";

const opaqueRedirect = { ok: false, status: 0, type: "opaqueredirect" } as Response;

describe("auth API(userInitiatedの配線)", () => {
  let assignSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sessionStorage.clear();
    // 直近にリダイレクト済み(スロットル有効)の状態を作る
    sessionStorage.setItem("authRedirectAt", String(Date.now()));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(opaqueRedirect));
    assignSpy = vi.spyOn(navigation, "assign").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["login", () => login("alice", "password123")],
    ["register", () => register("alice", "password123")],
    ["logout", () => logout()],
  ])("%s はスロットル中でもopaqueredirect検出時に再認証へ遷移する", async (_name, call) => {
    await expect(call()).rejects.toThrow(
      "ログインセッションの有効期限が切れました。再ログインしています…",
    );
    expect(assignSpy).toHaveBeenCalledExactlyOnceWith("/api/auth/refresh");
  });
});
