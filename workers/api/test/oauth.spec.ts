import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createOAuthConnection, sha256Hex } from "../src/lib/agentConnections";
import {
  MAX_UNUSED_CLIENTS,
  UNUSED_CLIENT_TTL_MS,
  consumeAuthorizationCode,
  fetchClientMetadata,
  findRegisteredClient,
  isRegisteredRedirectUri,
  issueAuthorizationCode,
  parseAuthorizeRequest,
  parseClientIdUrl,
  purgeExpiredOAuthData,
  redirectWith,
  registerClient,
  resolveClient,
  validateClientMetadata,
  validateRegistration,
  verifyPkce,
} from "../src/lib/oauth";
import { applyMigrations } from "./helpers/migrations";

beforeAll(async () => {
  await applyMigrations(env.DB);
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
});

const VERIFIER = "v".repeat(43);
async function challengeOf(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("parseClientIdUrl", () => {
  it("パス付きの https URL だけを受け付ける", () => {
    expect(parseClientIdUrl("https://agent.example/client.json")).not.toBeNull();
    for (const bad of [
      "http://agent.example/client.json",
      "https://agent.example/",
      "https://agent.example/a/../b",
      "https://user:pw@agent.example/c",
      "https://agent.example/c#x",
      "https://agent.example:8443/c",
      "https://127.0.0.1/c",
      "https://[::1]/c",
      "https://localhost/c",
      "not a url",
    ]) {
      expect(parseClientIdUrl(bad), bad).toBeNull();
    }
  });
});

describe("validateClientMetadata", () => {
  const id = "https://agent.example/client.json";
  it("client_id の一致・redirect_uris・公開クライアントを求める", () => {
    expect(validateClientMetadata(id, { client_id: id, redirect_uris: ["https://agent.example/cb"], client_name: " muse " }))
      .toEqual({ clientId: id, clientName: "muse", redirectUris: ["https://agent.example/cb"], kind: "cimd" });
    expect(typeof validateClientMetadata(id, { client_id: "https://other.example/c", redirect_uris: ["https://a.example"] })).toBe("string");
    expect(typeof validateClientMetadata(id, { client_id: id })).toBe("string");
    expect(typeof validateClientMetadata(id, { client_id: id, redirect_uris: ["https://a.example"], token_endpoint_auth_method: "client_secret_basic" })).toBe("string");
  });
});

describe("isRegisteredRedirectUri", () => {
  it("完全一致、またはループバックのポート違いだけを許す", () => {
    expect(isRegisteredRedirectUri(["https://a.example/cb"], "https://a.example/cb")).toBe(true);
    expect(isRegisteredRedirectUri(["https://a.example/cb"], "https://a.example/cb2")).toBe(false);
    expect(isRegisteredRedirectUri(["http://127.0.0.1/cb"], "http://127.0.0.1:53111/cb")).toBe(true);
    expect(isRegisteredRedirectUri(["http://127.0.0.1/cb"], "http://127.0.0.1:53111/other")).toBe(false);
    expect(isRegisteredRedirectUri(["https://a.example/cb"], "https://a.example:444/cb")).toBe(false);
  });
});

describe("fetchClientMetadata", () => {
  const origin = "https://cimd.example";

  it("200 の JSON を返す", async () => {
    fetchMock.get(origin).intercept({ path: "/ok.json" }).reply(200, { client_id: "x" });
    expect(await fetchClientMetadata(new URL(`${origin}/ok.json`))).toEqual({ client_id: "x" });
  });

  it("リダイレクトは追わない", async () => {
    fetchMock.get(origin).intercept({ path: "/redirect.json" }).reply(302, "", { headers: { location: "http://169.254.169.254/" } });
    await expect(fetchClientMetadata(new URL(`${origin}/redirect.json`))).rejects.toThrow("HTTP 302");
  });

  it("10KB を超える文書は読まない", async () => {
    fetchMock.get(origin).intercept({ path: "/big.json" }).reply(200, JSON.stringify({ pad: "x".repeat(20 * 1024) }));
    await expect(fetchClientMetadata(new URL(`${origin}/big.json`))).rejects.toThrow("大きすぎます");
  });

  it("JSON でなければ失敗", async () => {
    fetchMock.get(origin).intercept({ path: "/html" }).reply(200, "<html>");
    await expect(fetchClientMetadata(new URL(`${origin}/html`))).rejects.toThrow("JSON ではありません");
  });
});

describe("resolveClient", () => {
  it("CIMD は文書を取得して検証し、失敗は理由を返す", async () => {
    const id = "https://agent.example/client.json";
    const ok = await resolveClient(env.DB, id, async () => ({ client_id: id, redirect_uris: ["https://agent.example/cb"] }));
    expect(ok).toMatchObject({ kind: "cimd" });
    const failed = await resolveClient(env.DB, id, async () => {
      throw new Error("HTTP 404");
    });
    expect(failed).toContain("HTTP 404");
    expect(typeof (await resolveClient(env.DB, "http://agent.example/c"))).toBe("string");
  });

  it("DCR の client_id は D1 から引く", async () => {
    const client = await registerClient(env.DB, { clientName: "muse", redirectUris: ["https://muse.example/cb"] });
    expect(await resolveClient(env.DB, client!.clientId)).toMatchObject({ kind: "dcr", clientName: "muse" });
    expect(typeof (await resolveClient(env.DB, "dcr_unknown"))).toBe("string");
  });
});

describe("validateRegistration", () => {
  it("戻り先は https かループバックの http だけ", () => {
    expect(validateRegistration({ redirect_uris: ["https://a.example/cb", "http://127.0.0.1/cb"], client_name: "muse" }))
      .toEqual({ clientName: "muse", redirectUris: ["https://a.example/cb", "http://127.0.0.1/cb"] });
    expect(validateRegistration({ redirect_uris: ["http://a.example/cb"] })).toHaveProperty("error", "invalid_redirect_uri");
    expect(validateRegistration({ redirect_uris: [] })).toHaveProperty("error", "invalid_redirect_uri");
    expect(validateRegistration({ redirect_uris: ["https://a.example/cb"], grant_types: ["client_credentials"] }))
      .toHaveProperty("error", "invalid_client_metadata");
    expect(validateRegistration(null)).toHaveProperty("error");
  });
});

describe("認可コード", () => {
  async function issue(over: Partial<{ clientId: string; redirectUri: string }> = {}, now = Date.now()) {
    return issueAuthorizationCode(
      env.DB,
      {
        clientId: "https://agent.example/client.json",
        redirectUri: "https://agent.example/cb",
        codeChallenge: await challengeOf(VERIFIER),
        userEmail: "code@example.com",
        name: "muse",
        ...over,
      },
      now,
    );
  }
  const check = { clientId: "https://agent.example/client.json", redirectUri: "https://agent.example/cb", codeVerifier: VERIFIER };

  it("1回だけ使え、2回目は null", async () => {
    const code = await issue();
    expect(await consumeAuthorizationCode(env.DB, code, check)).toMatchObject({ userEmail: "code@example.com" });
    expect(await consumeAuthorizationCode(env.DB, code, check)).toBeNull();
  });

  it("60秒を過ぎたら使えない", async () => {
    const now = Date.now();
    const code = await issue({}, now);
    expect(await consumeAuthorizationCode(env.DB, code, check, now + 60_000)).toBeNull();
  });

  it("PKCE・クライアント・戻り先が違えば使えず、コードは消える", async () => {
    const code = await issue();
    expect(await consumeAuthorizationCode(env.DB, code, { ...check, codeVerifier: "w".repeat(43) })).toBeNull();
    expect(await consumeAuthorizationCode(env.DB, code, check)).toBeNull();
    const code2 = await issue();
    expect(await consumeAuthorizationCode(env.DB, code2, { ...check, redirectUri: "https://agent.example/other" })).toBeNull();
  });

  it("verifyPkce は S256 だけ", async () => {
    expect(await verifyPkce(VERIFIER, await challengeOf(VERIFIER))).toBe(true);
    expect(await verifyPkce(VERIFIER, VERIFIER)).toBe(false);
    expect(await verifyPkce("short", await challengeOf("short"))).toBe(false);
  });
});

describe("parseAuthorizeRequest", () => {
  const resource = "https://app.example/mcp";
  const base = async () =>
    new URLSearchParams({
      response_type: "code",
      client_id: "https://agent.example/client.json",
      redirect_uri: "https://agent.example/cb",
      code_challenge: await challengeOf(VERIFIER),
      code_challenge_method: "S256",
      state: "xyz",
    });

  it("正しいリクエストは ok", async () => {
    const params = await base();
    params.set("resource", resource);
    expect(parseAuthorizeRequest(params, resource)).toHaveProperty("ok");
  });

  it("client_id・redirect_uri が無ければ戻り先に返せない誤り", async () => {
    const params = await base();
    params.delete("redirect_uri");
    expect(parseAuthorizeRequest(params, resource)).toHaveProperty("fatal");
  });

  it("PKCE の方式違い・resource 違いは戻り先へ返す誤り", async () => {
    const plain = await base();
    plain.set("code_challenge_method", "plain");
    expect(parseAuthorizeRequest(plain, resource)).toMatchObject({ redirectError: "invalid_request" });
    const other = await base();
    other.set("resource", "https://evil.example/mcp");
    expect(parseAuthorizeRequest(other, resource)).toMatchObject({ redirectError: "invalid_target" });
  });

  it("redirectWith は iss を付ける", () => {
    expect(redirectWith("https://a.example/cb?x=1", { code: "c", state: null }, "https://app.example"))
      .toBe("https://a.example/cb?x=1&code=c&iss=https%3A%2F%2Fapp.example");
  });
});

describe("DCR の登録数の上限", () => {
  it("未使用の登録が上限に達したら断る", async () => {
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM oauth_clients").first<{ n: number }>();
    const fill = MAX_UNUSED_CLIENTS - (before?.n ?? 0);
    const statements = Array.from({ length: fill }, (_, i) =>
      env.DB.prepare("INSERT INTO oauth_clients (id, client_name, redirect_uris, created_at) VALUES (?, NULL, '[]', ?)").bind(
        `dcr_fill_${i}`,
        new Date().toISOString(),
      ),
    );
    await env.DB.batch(statements);
    expect(await registerClient(env.DB, { clientName: null, redirectUris: ["https://a.example/cb"] })).toBeNull();
    await env.DB.prepare("DELETE FROM oauth_clients WHERE id LIKE 'dcr_fill_%'").run();
  });
});

describe("purgeExpiredOAuthData", () => {
  it("期限切れのコード・未使用の古い登録・90日使われていない接続を消し、使われている登録は残す", async () => {
    const now = Date.now();
    const old = now - UNUSED_CLIENT_TTL_MS - 1;
    const unused = await registerClient(env.DB, { clientName: "unused", redirectUris: ["https://a.example/cb"] }, old);
    const used = await registerClient(env.DB, { clientName: "used", redirectUris: ["https://a.example/cb"] }, old);
    await createOAuthConnection(env.DB, "purge@example.com", used!.clientId, "used", now);
    const expiredCode = await issueAuthorizationCode(
      env.DB,
      { clientId: "c", redirectUri: "https://a.example/cb", codeChallenge: "x", userEmail: "purge@example.com", name: "n" },
      now - 120_000,
    );

    await purgeExpiredOAuthData(env.DB, now);

    expect(await findRegisteredClient(env.DB, unused!.clientId)).toBeNull();
    expect(await findRegisteredClient(env.DB, used!.clientId)).not.toBeNull();
    const code = await env.DB.prepare("SELECT 1 FROM oauth_codes WHERE code_hash = ?").bind(await sha256Hex(expiredCode)).first();
    expect(code).toBeNull();

    await purgeExpiredOAuthData(env.DB, now + 91 * 24 * 60 * 60 * 1000);
    const conn = await env.DB.prepare("SELECT 1 FROM agent_connections WHERE user_email = ?").bind("purge@example.com").first();
    expect(conn).toBeNull();
  });
});
