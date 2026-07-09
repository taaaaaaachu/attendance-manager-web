import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { authHeaders, generateUntrustedKey, mockAccessCerts, signAccessJwt } from "./helpers/access";
import { applyMigrations } from "./helpers/migrations";

beforeAll(async () => {
  await applyMigrations(env.DB);
  await mockAccessCerts();
});

describe("GET /api/auth/refresh", () => {
  it("認証なしでもトップページへの302を返す(Cloudflare Accessセッション復帰用)", async () => {
    const res = await SELF.fetch("http://example.com/api/auth/refresh", {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
  });
});

describe("GET /api/auth/me(Access JWT検証)", () => {
  it("有効なJWTならメールアドレスを返す", async () => {
    const res = await SELF.fetch("http://example.com/api/auth/me", {
      headers: await authHeaders("alice@example.com"),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userId: "alice@example.com",
      email: "alice@example.com",
      isAdmin: false,
    });
  });

  it("メールアドレスは小文字に正規化される", async () => {
    const res = await SELF.fetch("http://example.com/api/auth/me", {
      headers: await authHeaders("Alice@Example.COM"),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userId: "alice@example.com",
      email: "alice@example.com",
      isAdmin: false,
    });
  });

  it("ADMIN_EMAILSに含まれるメールアドレスはisAdmin: trueになる", async () => {
    const adminEmail = env.ADMIN_EMAILS.split(",")[0];
    const res = await SELF.fetch("http://example.com/api/auth/me", {
      headers: await authHeaders(adminEmail),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: adminEmail, email: adminEmail, isAdmin: true });
  });

  it("JWTヘッダなしは401", async () => {
    const res = await SELF.fetch("http://example.com/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("JWKSに載っていない鍵で署名されたJWTは401", async () => {
    const untrustedKey = await generateUntrustedKey();
    const token = await signAccessJwt({ email: "evil@example.com", privateKey: untrustedKey });
    const res = await SELF.fetch("http://example.com/api/auth/me", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    });
    expect(res.status).toBe(401);
  });

  it("audが異なるJWTは401(他のAccessアプリのトークンを拒否)", async () => {
    const token = await signAccessJwt({ email: "alice@example.com", aud: "other-app-aud" });
    const res = await SELF.fetch("http://example.com/api/auth/me", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    });
    expect(res.status).toBe(401);
  });

  it("issuerが異なるJWTは401", async () => {
    const token = await signAccessJwt({
      email: "alice@example.com",
      iss: "https://evil.cloudflareaccess.com",
    });
    const res = await SELF.fetch("http://example.com/api/auth/me", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    });
    expect(res.status).toBe(401);
  });

  it("期限切れのJWTは401", async () => {
    const token = await signAccessJwt({ email: "alice@example.com", expiresInSec: -300 });
    const res = await SELF.fetch("http://example.com/api/auth/me", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    });
    expect(res.status).toBe(401);
  });

  it("JWT形式でない文字列は401", async () => {
    const res = await SELF.fetch("http://example.com/api/auth/me", {
      headers: { "Cf-Access-Jwt-Assertion": "not-a-jwt" },
    });
    expect(res.status).toBe(401);
  });
});
