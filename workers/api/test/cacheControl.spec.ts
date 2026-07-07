import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { authHeaders, mockAccessCerts } from "./helpers/access";
import { applyMigrations } from "./helpers/migrations";

beforeAll(async () => {
  await applyMigrations(env.DB);
  await mockAccessCerts();
});

// APIの応答がブラウザのHTTPキャッシュに残ると、認証層(Cloudflare Access)の302などが
// セッション復帰後も返り続けてアプリが詰まるため、全API応答にno-storeを付ける
describe("Cache-Control: no-store", () => {
  it("正常系のリダイレクト応答(/api/auth/refresh)に付与される", async () => {
    const res = await SELF.fetch("http://example.com/api/auth/refresh", {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("認証済みの正常応答(200)に付与される", async () => {
    const res = await SELF.fetch("http://example.com/api/records", {
      headers: await authHeaders("cacheuser@example.com"),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("未認証エラー(401)の応答にも付与される", async () => {
    const res = await SELF.fetch("http://example.com/api/records");
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
