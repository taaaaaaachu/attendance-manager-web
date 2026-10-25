import { env, fetchMock, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { authenticateAgent, listAgentConnections } from "../src/lib/agentConnections";
import { authHeaders, mockAccessCerts } from "./helpers/access";
import { applyMigrations } from "./helpers/migrations";

/** 同意画面からトークン発行・リフレッシュ・取り消しまでを、本物のWorkerに通して確かめる */

const ORIGIN = "http://example.com";
const CLIENT = "https://agent.example/client.json";
const REDIRECT = "https://agent.example/cb";
const VERIFIER = "v".repeat(43);
let CHALLENGE: string;

beforeAll(async () => {
  await applyMigrations(env.DB);
  await mockAccessCerts();
  fetchMock
    .get("https://agent.example")
    .intercept({ path: "/client.json" })
    .reply(200, { client_id: CLIENT, client_name: "muse", redirect_uris: [REDIRECT] })
    .persist();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(VERIFIER)));
  CHALLENGE = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
});

function authorizeUrl(over: Record<string, string> = {}): string {
  const url = new URL("/oauth/authorize", ORIGIN);
  const params = {
    response_type: "code",
    client_id: CLIENT,
    redirect_uri: REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    state: "xyz",
    resource: `${ORIGIN}/mcp`,
    ...over,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.href;
}

async function allow(email: string, over: Record<string, string> = {}, fields: Record<string, string> = {}) {
  return SELF.fetch(authorizeUrl(over), {
    method: "POST",
    redirect: "manual",
    headers: await authHeaders(email, { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({ decision: "allow", ...fields }),
  });
}

function tokenRequest(fields: Record<string, string>): Promise<Response> {
  // エージェントのサーバーからはOriginもAccessのJWTも付かない
  return SELF.fetch(`${ORIGIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
}

async function codeFrom(res: Response): Promise<string> {
  expect(res.status).toBe(303);
  const location = new URL(res.headers.get("Location")!);
  expect(location.origin + location.pathname).toBe(REDIRECT);
  expect(location.searchParams.get("state")).toBe("xyz");
  expect(location.searchParams.get("iss")).toBe(ORIGIN);
  return location.searchParams.get("code")!;
}

function exchange(code: string, verifier = VERIFIER) {
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: CLIENT,
    code,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
  });
}

describe("同意画面", () => {
  it("Access の JWT が無ければ表示しない", async () => {
    const res = await SELF.fetch(authorizeUrl());
    expect(res.status).toBe(401);
  });

  it("接続元・許可するアカウントを表示し、埋め込みを禁じる", async () => {
    const res = await SELF.fetch(authorizeUrl(), { headers: await authHeaders("consent@example.com") });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    const body = await res.text();
    expect(body).toContain("agent.example");
    expect(body).toContain("consent@example.com");
  });

  it("登録されていない戻り先は戻り先へ返さず画面に出す", async () => {
    const res = await SELF.fetch(authorizeUrl({ redirect_uri: "https://evil.example/cb" }), {
      headers: await authHeaders("consent@example.com"),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("redirect_uri");
  });

  it("戻り先を確かめた後の誤り(PKCE の方式違い)は error 付きで戻り先へ返す", async () => {
    const res = await SELF.fetch(authorizeUrl({ code_challenge_method: "plain" }), {
      redirect: "manual",
      headers: await authHeaders("consent@example.com"),
    });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("Location")!).searchParams.get("error")).toBe("invalid_request");
  });

  it("他サイトからの POST(Origin 不一致・無し)は受け付けない", async () => {
    for (const origin of ["https://evil.example", undefined]) {
      const headers = await authHeaders("csrf@example.com", { "Content-Type": "application/x-www-form-urlencoded" });
      if (origin) headers.Origin = origin;
      const res = await SELF.fetch(authorizeUrl(), {
        method: "POST",
        redirect: "manual",
        headers,
        body: new URLSearchParams({ decision: "allow" }),
      });
      expect(res.status).toBe(403);
    }
    expect(await listAgentConnections(env.DB, "csrf@example.com")).toEqual([]);
  });

  it("拒否すると access_denied で戻り先へ返す", async () => {
    const res = await SELF.fetch(authorizeUrl(), {
      method: "POST",
      redirect: "manual",
      headers: await authHeaders("deny@example.com", { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ decision: "deny" }),
    });
    expect(new URL(res.headers.get("Location")!).searchParams.get("error")).toBe("access_denied");
  });
});

describe("トークン", () => {
  it("許可→コード交換で、許可した人の接続ができる", async () => {
    const code = await codeFrom(await allow("flow@example.com", {}, { name: "わたしの muse" }));
    const res = await exchange(code);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json<{ access_token: string; refresh_token: string; expires_in: number; token_type: string }>();
    expect(body).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
    expect(await authenticateAgent(env.DB, body.access_token)).toMatchObject({ userEmail: "flow@example.com" });
    expect(await listAgentConnections(env.DB, "flow@example.com")).toMatchObject([{ name: "わたしの muse", kind: "oauth" }]);

    // コードは1回きり
    expect((await exchange(code)).status).toBe(400);

    // リフレッシュで入れ替わる
    const refreshed = await tokenRequest({ grant_type: "refresh_token", client_id: CLIENT, refresh_token: body.refresh_token });
    expect(refreshed.status).toBe(200);
    const next = await refreshed.json<{ access_token: string; refresh_token: string }>();
    expect(await authenticateAgent(env.DB, next.access_token)).not.toBeNull();

    // 取り消すと接続ごと消える
    const revoked = await SELF.fetch(`${ORIGIN}/oauth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: next.refresh_token, client_id: CLIENT }),
    });
    expect(revoked.status).toBe(200);
    expect(await authenticateAgent(env.DB, next.access_token)).toBeNull();
  });

  it("PKCE の code_verifier が違えば交換できない", async () => {
    const code = await codeFrom(await allow("pkce@example.com"));
    const res = await exchange(code, "w".repeat(43));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("未対応の grant_type は unsupported_grant_type", async () => {
    const res = await tokenRequest({ grant_type: "client_credentials", client_id: CLIENT });
    expect(await res.json()).toMatchObject({ error: "unsupported_grant_type" });
  });
});

describe("DCR", () => {
  it("登録した client_id で同意からトークンまで通る", async () => {
    const reg = await SELF.fetch(`${ORIGIN}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1" },
      body: JSON.stringify({ client_name: "muse", redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" }),
    });
    expect(reg.status).toBe(201);
    const client = await reg.json<{ client_id: string; token_endpoint_auth_method: string }>();
    expect(client.token_endpoint_auth_method).toBe("none");

    const code = await codeFrom(await allow("dcr@example.com", { client_id: client.client_id }));
    const res = await tokenRequest({
      grant_type: "authorization_code",
      client_id: client.client_id,
      code,
      redirect_uri: REDIRECT,
      code_verifier: VERIFIER,
    });
    expect(res.status).toBe(200);
    expect(await listAgentConnections(env.DB, "dcr@example.com")).toMatchObject([{ origin: "agent.example(自己登録)" }]);
  });

  it("不正な戻り先は登録できない", async () => {
    const res = await SELF.fetch(`${ORIGIN}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.2" },
      body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }),
    });
    expect(res.status).toBe(400);
  });

  it("同じ IP から短時間に登録しすぎると 429", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await SELF.fetch(`${ORIGIN}/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.3" },
        body: JSON.stringify({ redirect_uris: [REDIRECT] }),
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

describe("メタデータ", () => {
  it("認可サーバーと保護リソースのメタデータを返す", async () => {
    const as = await (await SELF.fetch(`${ORIGIN}/.well-known/oauth-authorization-server`)).json<Record<string, unknown>>();
    expect(as).toMatchObject({
      issuer: ORIGIN,
      token_endpoint: `${ORIGIN}/oauth/token`,
      registration_endpoint: `${ORIGIN}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
    });
    for (const path of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]) {
      const pr = await (await SELF.fetch(`${ORIGIN}${path}`)).json<Record<string, unknown>>();
      expect(pr).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] });
    }
  });
});
