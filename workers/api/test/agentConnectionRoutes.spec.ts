import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { authenticateAgent } from "../src/lib/agentConnections";
import { authHeaders, mockAccessCerts } from "./helpers/access";
import { applyMigrations } from "./helpers/migrations";

beforeAll(async () => {
  await applyMigrations(env.DB);
  await mockAccessCerts();
});

const URL_BASE = "http://example.com/api/agent-connections";

async function issue(email: string, name: unknown): Promise<Response> {
  return SELF.fetch(URL_BASE, {
    method: "POST",
    headers: await authHeaders(email, { "Content-Type": "application/json" }),
    body: JSON.stringify({ name }),
  });
}

async function list(email: string) {
  const res = await SELF.fetch(URL_BASE, { headers: await authHeaders(email) });
  return (await res.json<{ connections: { id: string; name: string; kind: string }[] }>()).connections;
}

describe("/api/agent-connections", () => {
  it("未認証は401", async () => {
    expect((await SELF.fetch(URL_BASE)).status).toBe(401);
  });

  it("手動発行したトークンは一度だけ返り、一覧に出て、そのトークンで認証できる", async () => {
    const res = await issue("routes-owner@example.com", " dots ");
    expect(res.status).toBe(201);
    const { id, token } = await res.json<{ id: string; token: string }>();
    expect(await authenticateAgent(env.DB, token)).toMatchObject({ userEmail: "routes-owner@example.com" });
    const connections = await list("routes-owner@example.com");
    expect(connections).toMatchObject([{ id, name: "dots", kind: "manual" }]);
    expect(JSON.stringify(connections)).not.toContain(token);
  });

  it("名前が空・長すぎるなら400", async () => {
    expect((await issue("routes-bad@example.com", "")).status).toBe(400);
    expect((await issue("routes-bad@example.com", "x".repeat(51))).status).toBe(400);
  });

  it("他人の接続は一覧に出ず、取り消せない", async () => {
    const { id, token } = await (await issue("routes-a@example.com", "a")).json<{ id: string; token: string }>();
    expect(await list("routes-b@example.com")).toEqual([]);
    const denied = await SELF.fetch(`${URL_BASE}/${id}`, { method: "DELETE", headers: await authHeaders("routes-b@example.com") });
    expect(denied.status).toBe(404);
    expect(await authenticateAgent(env.DB, token)).not.toBeNull();

    const ok = await SELF.fetch(`${URL_BASE}/${id}`, { method: "DELETE", headers: await authHeaders("routes-a@example.com") });
    expect(ok.status).toBe(200);
    expect(await authenticateAgent(env.DB, token)).toBeNull();
  });
});
