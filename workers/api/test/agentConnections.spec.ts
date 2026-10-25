import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_TTL_MS,
  AGENT_IDLE_TTL_MS,
  authenticateAgent,
  createOAuthConnection,
  issueManualConnection,
  listAgentConnections,
  normalizeAgentName,
  refreshConnection,
  revokeAgentConnection,
  revokeByToken,
} from "../src/lib/agentConnections";
import { applyMigrations } from "./helpers/migrations";

beforeAll(async () => {
  await applyMigrations(env.DB);
});

const CLIENT = "https://agent.example/client.json";

describe("normalizeAgentName", () => {
  it("前後の空白を除き、空や長すぎる名前は null", () => {
    expect(normalizeAgentName("  muse ")).toBe("muse");
    expect(normalizeAgentName("   ")).toBeNull();
    expect(normalizeAgentName("x".repeat(51))).toBeNull();
    expect(normalizeAgentName(1)).toBeNull();
  });
});

describe("手動発行", () => {
  it("発行したトークンで発行者として認証でき、期限は無い", async () => {
    const now = Date.now();
    const { token } = await issueManualConnection(env.DB, "manual@example.com", "dots", now);
    expect(token.startsWith("amw_")).toBe(true);
    const later = now + 30 * 24 * 60 * 60 * 1000;
    expect(await authenticateAgent(env.DB, token, later)).toMatchObject({ userEmail: "manual@example.com" });
  });

  it("90日使われなければ失効し、接続も消える", async () => {
    const now = Date.now();
    const { token } = await issueManualConnection(env.DB, "idle@example.com", "dots", now);
    expect(await authenticateAgent(env.DB, token, now + AGENT_IDLE_TTL_MS + 1)).toBeNull();
    expect(await listAgentConnections(env.DB, "idle@example.com")).toEqual([]);
  });

  it("使うたびに最終利用日時が延び、90日を過ぎても使い続けていれば有効", async () => {
    const now = Date.now();
    const { token } = await issueManualConnection(env.DB, "active@example.com", "dots", now);
    const half = AGENT_IDLE_TTL_MS / 2;
    expect(await authenticateAgent(env.DB, token, now + half)).not.toBeNull();
    expect(await authenticateAgent(env.DB, token, now + half * 2 + 1)).not.toBeNull();
  });

  it("知らないトークンは null", async () => {
    expect(await authenticateAgent(env.DB, "amw_unknown")).toBeNull();
  });
});

describe("OAuthの接続", () => {
  it("アクセストークンは1時間で切れ、リフレッシュで入れ替わる", async () => {
    const now = Date.now();
    const t1 = await createOAuthConnection(env.DB, "oauth@example.com", CLIENT, "muse", now);
    expect(await authenticateAgent(env.DB, t1.accessToken, now + ACCESS_TOKEN_TTL_MS)).toBeNull();

    const t2 = await refreshConnection(env.DB, t1.refreshToken, CLIENT, now + ACCESS_TOKEN_TTL_MS);
    expect(t2).not.toBeNull();
    expect(await authenticateAgent(env.DB, t2!.accessToken, now + ACCESS_TOKEN_TTL_MS)).not.toBeNull();
    expect(await authenticateAgent(env.DB, t1.accessToken, now)).toBeNull();
  });

  it("古いリフレッシュトークンが再び使われたら接続ごと失効する", async () => {
    const t1 = await createOAuthConnection(env.DB, "reuse@example.com", CLIENT, "muse");
    const t2 = await refreshConnection(env.DB, t1.refreshToken, CLIENT);
    expect(await refreshConnection(env.DB, t1.refreshToken, CLIENT)).toBeNull();
    expect(await refreshConnection(env.DB, t2!.refreshToken, CLIENT)).toBeNull();
    expect(await listAgentConnections(env.DB, "reuse@example.com")).toEqual([]);
  });

  it("別のクライアントのリフレッシュトークンは使えない", async () => {
    const t = await createOAuthConnection(env.DB, "other@example.com", CLIENT, "muse");
    expect(await refreshConnection(env.DB, t.refreshToken, "https://evil.example/c.json")).toBeNull();
    expect(await refreshConnection(env.DB, t.refreshToken, CLIENT)).not.toBeNull();
  });

  it("同じ発行者・同じクライアントで繋ぎ直すと既存の接続を置き換える", async () => {
    const t1 = await createOAuthConnection(env.DB, "again@example.com", CLIENT, "muse");
    await createOAuthConnection(env.DB, "again@example.com", CLIENT, "muse");
    expect(await listAgentConnections(env.DB, "again@example.com")).toHaveLength(1);
    expect(await authenticateAgent(env.DB, t1.accessToken)).toBeNull();
  });

  it("revokeByToken はそのクライアントのトークンだけ接続ごと消す", async () => {
    const t = await createOAuthConnection(env.DB, "revoke@example.com", CLIENT, "muse");
    await revokeByToken(env.DB, t.accessToken, "https://evil.example/c.json");
    expect(await authenticateAgent(env.DB, t.accessToken)).not.toBeNull();
    await revokeByToken(env.DB, t.refreshToken, CLIENT);
    expect(await authenticateAgent(env.DB, t.accessToken)).toBeNull();
  });
});

describe("一覧と取り消し", () => {
  it("本人の一覧には本人の接続だけ、全体の一覧には全員分が出る", async () => {
    await issueManualConnection(env.DB, "list-a@example.com", "A の接続");
    await createOAuthConnection(env.DB, "list-b@example.com", CLIENT, "muse");
    const own = await listAgentConnections(env.DB, "list-a@example.com");
    expect(own).toMatchObject([{ name: "A の接続", kind: "manual", origin: "手動発行" }]);
    const all = await listAgentConnections(env.DB, null);
    expect(all.find((c) => c.userEmail === "list-b@example.com")).toMatchObject({
      kind: "oauth",
      origin: "agent.example",
    });
  });

  it("他人の接続は本人として取り消せないが、管理者(null)なら取り消せる", async () => {
    const { id, token } = await issueManualConnection(env.DB, "victim@example.com", "x");
    expect(await revokeAgentConnection(env.DB, id, "attacker@example.com")).toBe(false);
    expect(await authenticateAgent(env.DB, token)).not.toBeNull();
    expect(await revokeAgentConnection(env.DB, id, null)).toBe(true);
    expect(await authenticateAgent(env.DB, token)).toBeNull();
  });
});
