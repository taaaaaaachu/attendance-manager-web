import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createOAuthConnection, issueManualConnection } from "../src/lib/agentConnections";
import { authHeaders, mockAccessCerts } from "./helpers/access";
import { applyMigrations } from "./helpers/migrations";

beforeAll(async () => {
  await applyMigrations(env.DB);
  await mockAccessCerts();
});

const ORIGIN = "http://example.com";

/** 本物のMCPクライアントで、Bearerトークンを付けて本物のWorkerの /mcp へ繋ぐ */
async function connect(token: string) {
  const client = new Client({ name: "test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
      fetch: (input, init) => {
        const req = new Request(input, init);
        req.headers.set("Authorization", `Bearer ${token}`);
        return SELF.fetch(req);
      },
    }),
  );
  return {
    tools: async () => (await client.listTools()).tools,
    call: async (name: string, args: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name, arguments: args });
      const text = (r.content as { type: string; text: string }[])[0].text;
      return { isError: r.isError === true, text, data: r.isError ? null : JSON.parse(text) };
    },
  };
}

async function tokenFor(email: string): Promise<string> {
  return (await issueManualConnection(env.DB, email, "test")).token;
}

describe("認証", () => {
  it("トークンが無い・不正なら401で認可サーバーの在処を知らせる", async () => {
    for (const headers of [{}, { Authorization: "Bearer amw_wrong" }] as Record<string, string>[]) {
      const res = await SELF.fetch(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).toBe(
        `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
      );
    }
  });

  it("Access の JWT だけでは /mcp を使えない", async () => {
    const res = await SELF.fetch(`${ORIGIN}/mcp`, {
      method: "POST",
      headers: await authHeaders("jwt-only@example.com", { "Content-Type": "application/json" }),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
  });

  it("エージェントのトークンは画面向けの /api では使えない", async () => {
    const token = await tokenFor("api-token@example.com");
    const res = await SELF.fetch(`${ORIGIN}/api/records`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });

  it("OAuth のアクセストークンでも使える", async () => {
    const { accessToken } = await createOAuthConnection(env.DB, "oauth-mcp@example.com", "https://agent.example/c.json", "muse");
    const mcp = await connect(accessToken);
    expect((await mcp.call("get_settings")).isError).toBe(false);
  });
});

describe("ツール一覧", () => {
  it("日常操作だけを出し、連携・管理・全件リセットは出さない", async () => {
    const mcp = await connect(await tokenFor("tools@example.com"));
    const tools = await mcp.tools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "add_company_day",
        "apply_schedule",
        "delete_record",
        "get_period_stats",
        "get_settings",
        "list_company_days",
        "list_japan_holidays",
        "list_records",
        "remove_company_day",
        "set_record",
        "update_settings",
      ].sort(),
    );
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.list_records.annotations?.readOnlyHint).toBe(true);
    expect(byName.delete_record.annotations?.destructiveHint).toBe(true);
    expect(byName.apply_schedule.annotations?.destructiveHint).toBe(true);
  });
});

describe("勤怠", () => {
  it("記録・一覧・削除ができ、画面のAPIと同じデータを読み書きする", async () => {
    const email = "records-mcp@example.com";
    const mcp = await connect(await tokenFor(email));
    expect((await mcp.call("set_record", { date: "2026-05-01", status: "office" })).isError).toBe(false);
    await mcp.call("set_record", { date: "2026-05-02", status: "remote" });

    const listed = await mcp.call("list_records", { start: "2026-05-02" });
    expect(listed.data.records).toMatchObject([{ date: "2026-05-02", status: "remote" }]);

    const api = await SELF.fetch(`${ORIGIN}/api/records`, { headers: await authHeaders(email) });
    expect((await api.json<{ records: unknown[] }>()).records).toHaveLength(2);

    await mcp.call("delete_record", { date: "2026-05-01" });
    expect((await mcp.call("list_records")).data.records).toHaveLength(1);
  });

  it("不正な日付・状態は受け付けない", async () => {
    const mcp = await connect(await tokenFor("bad-input@example.com"));
    expect((await mcp.call("set_record", { date: "2026-02-30", status: "office" })).isError).toBe(true);
    expect((await mcp.call("set_record", { date: "2026-05-01", status: "vacation" })).isError).toBe(true);
  });

  it("連携メンバーが発行した接続は所有者のカレンダーを操作し、解除すると自分のカレンダーに戻る", async () => {
    const owner = "mcp-owner@example.com";
    const member = "mcp-member@example.com";
    await env.DB.prepare("INSERT INTO account_links (owner_email, member_email, created_at) VALUES (?, ?, ?)")
      .bind(owner, member, new Date().toISOString())
      .run();
    const token = await tokenFor(member);

    await (await connect(token)).call("set_record", { date: "2026-06-01", status: "office" });
    const ownerRecords = await SELF.fetch(`${ORIGIN}/api/records`, { headers: await authHeaders(owner) });
    expect((await ownerRecords.json<{ records: unknown[] }>()).records).toHaveLength(1);

    await env.DB.prepare("DELETE FROM account_links WHERE member_email = ?").bind(member).run();
    expect((await (await connect(token)).call("list_records")).data.records).toEqual([]);
  });
});

describe("期間・設定・休日・スケジュール", () => {
  it("設定を部分変更でき、範囲外の値は断る", async () => {
    const mcp = await connect(await tokenFor("settings-mcp@example.com"));
    const updated = await mcp.call("update_settings", { targetOfficeRate: 60, closingDay: 0 });
    expect(updated.data).toMatchObject({ targetOfficeRate: 60, closingDay: 0, closingDayShift: "none" });
    expect((await mcp.call("update_settings", { targetOfficeRate: 150 })).isError).toBe(true);
    expect((await mcp.call("get_settings")).data.targetOfficeRate).toBe(60);
  });

  it("期間と出社率を返す", async () => {
    const mcp = await connect(await tokenFor("stats-mcp@example.com"));
    const { data } = await mcp.call("get_period_stats", { offsetMonths: 0 });
    expect(data.period).toHaveProperty("startDate");
    expect(data.stats).toHaveProperty("officeRate");
    expect(data.targetOfficeRate).toBe(50);
  });

  it("会社の休日・出勤日を追加・一覧・削除できる", async () => {
    const mcp = await connect(await tokenFor("company-mcp@example.com"));
    await mcp.call("add_company_day", { kind: "holiday", date: "2026-08-13" });
    await mcp.call("add_company_day", { kind: "working_day", date: "2026-08-15" });
    expect((await mcp.call("list_company_days")).data).toEqual({ holidays: ["2026-08-13"], workingDays: ["2026-08-15"] });
    await mcp.call("remove_company_day", { kind: "holiday", date: "2026-08-13" });
    expect((await mcp.call("list_company_days")).data.holidays).toEqual([]);
  });

  it("日本の祝日を年で絞って返す", async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO japan_holidays (date, fetched_at) VALUES ('2026-01-01', 'x'), ('2027-01-01', 'x')").run();
    const mcp = await connect(await tokenFor("holiday-mcp@example.com"));
    expect((await mcp.call("list_japan_holidays", { year: 2026 })).data.holidays).toEqual(["2026-01-01"]);
  });

  it("スケジュールは目標を下回るなら適用せず、force で適用する", async () => {
    const mcp = await connect(await tokenFor("schedule-mcp@example.com"));
    const allRemote = [1, 2, 3, 4, 5];
    const warned = await mcp.call("apply_schedule", { remoteWeekdays: allRemote });
    expect(warned.data).toMatchObject({ applied: false, warning: true });
    expect((await mcp.call("list_records")).data.records).toEqual([]);

    const forced = await mcp.call("apply_schedule", { remoteWeekdays: allRemote, force: true });
    expect(forced.data).toMatchObject({ applied: true });
    expect((await mcp.call("list_records")).data.records.length).toBeGreaterThan(0);
  });
});
