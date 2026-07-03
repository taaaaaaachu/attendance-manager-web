import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error ?raw インポートはビルド時に文字列として解決される(src/sql.d.ts参照)
import migrationSql from "../migrations/0001_init.sql?raw";

beforeAll(async () => {
  const statements = migrationSql
    .split(";")
    .map((s: string) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
});

function extractSessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/session=([^;]+)/);
  if (!match) throw new Error("session cookieが見つかりません");
  return match[0];
}

describe("POST /api/auth/register", () => {
  it("正しい入力で登録に成功し、セッションCookieが発行される", async () => {
    const res = await SELF.fetch("http://example.com/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "alice", password: "password123" }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    const body = await res.json();
    expect(body).toEqual({ userId: "alice" });
  });

  it("IDが不正な形式なら400", async () => {
    const res = await SELF.fetch("http://example.com/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "a", password: "password123" }),
    });
    expect(res.status).toBe(400);
  });

  it("パスワードが短すぎる場合は400", async () => {
    const res = await SELF.fetch("http://example.com/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "bob", password: "short" }),
    });
    expect(res.status).toBe(400);
  });

  it("同じIDで再登録すると409", async () => {
    await SELF.fetch("http://example.com/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "carol", password: "password123" }),
    });
    const res = await SELF.fetch("http://example.com/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "carol", password: "password123" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("認証フロー(login/me/logout)", () => {
  it("register → login → me → logout → me(401) が一通り通る", async () => {
    await SELF.fetch("http://example.com/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "dave", password: "password123" }),
    });

    const loginRes = await SELF.fetch("http://example.com/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "dave", password: "password123" }),
    });
    expect(loginRes.status).toBe(200);
    const cookie = extractSessionCookie(loginRes);

    const meRes = await SELF.fetch("http://example.com/api/auth/me", {
      headers: { Cookie: cookie },
    });
    expect(meRes.status).toBe(200);
    expect(await meRes.json()).toEqual({ userId: "dave", email: null });

    const meWithoutCookie = await SELF.fetch("http://example.com/api/auth/me");
    expect(meWithoutCookie.status).toBe(401);

    const logoutRes = await SELF.fetch("http://example.com/api/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(logoutRes.status).toBe(200);

    const meAfterLogout = await SELF.fetch("http://example.com/api/auth/me", {
      headers: { Cookie: cookie },
    });
    expect(meAfterLogout.status).toBe(401);
  });

  it("誤ったパスワードでは401になり、セッションは発行されない", async () => {
    await SELF.fetch("http://example.com/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "erin", password: "password123" }),
    });

    const res = await SELF.fetch("http://example.com/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "erin", password: "wrongpassword" }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("存在しないユーザーでのログインも401(存在有無を漏らさない)", async () => {
    const res = await SELF.fetch("http://example.com/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "no-such-user", password: "password123" }),
    });
    expect(res.status).toBe(401);
  });

  it("5回連続で失敗すると429でロックアウトされる", async () => {
    await SELF.fetch("http://example.com/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "frank", password: "password123" }),
    });

    for (let i = 0; i < 5; i++) {
      await SELF.fetch("http://example.com/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "frank", password: "wrongpassword" }),
      });
    }

    const res = await SELF.fetch("http://example.com/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "frank", password: "password123" }),
    });
    expect(res.status).toBe(429);
  });
});
