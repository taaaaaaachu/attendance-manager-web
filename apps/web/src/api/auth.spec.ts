import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCurrentUser, logout } from "./auth";
import { navigation } from "./client";

describe("auth API(Cloudflare Access一本化)", () => {
  let assignSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sessionStorage.clear();
    assignSpy = vi.spyOn(navigation, "assign").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetchCurrentUserは/api/auth/meからユーザー情報を取得する", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      type: "basic",
      json: () => Promise.resolve({ userId: "alice@example.com", email: "alice@example.com" }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCurrentUser()).resolves.toEqual({
      userId: "alice@example.com",
      email: "alice@example.com",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", expect.anything());
  });

  it("logoutはCloudflare Accessのログアウトへ遷移する", () => {
    logout();
    expect(assignSpy).toHaveBeenCalledExactlyOnceWith("/cdn-cgi/access/logout");
  });
});
