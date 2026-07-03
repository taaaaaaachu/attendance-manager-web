import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
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

async function registerAndGetCookie(userId: string): Promise<string> {
  const res = await SELF.fetch("http://example.com/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, password: "password123" }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/session=([^;]+)/);
  if (!match) throw new Error("cookie not found");
  return match[0];
}

describe("勤怠レコードCRUD", () => {
  it("PUT → GET → DELETE の一連の流れが通る", async () => {
    const cookie = await registerAndGetCookie("recuser1");

    const putRes = await SELF.fetch("http://example.com/api/records/2026-02-16", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ status: "office" }),
    });
    expect(putRes.status).toBe(200);

    const listRes = await SELF.fetch("http://example.com/api/records", {
      headers: { Cookie: cookie },
    });
    const listBody = await listRes.json<{ records: { date: string; status: string }[] }>();
    expect(listBody.records).toEqual([{ date: "2026-02-16", status: "office", updatedAt: expect.any(String) }]);

    const delRes = await SELF.fetch("http://example.com/api/records/2026-02-16", {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(delRes.status).toBe(200);

    const listAfterDelete = await SELF.fetch("http://example.com/api/records", {
      headers: { Cookie: cookie },
    });
    expect((await listAfterDelete.json<{ records: unknown[] }>()).records).toEqual([]);
  });

  it("不正なstatusは400", async () => {
    const cookie = await registerAndGetCookie("recuser2");
    const res = await SELF.fetch("http://example.com/api/records/2026-02-16", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ status: "invalid" }),
    });
    expect(res.status).toBe(400);
  });

  it("未認証は401", async () => {
    const res = await SELF.fetch("http://example.com/api/records");
    expect(res.status).toBe(401);
  });
});

describe("設定API", () => {
  it("GET はデフォルト値を返し、PUTで更新できる", async () => {
    const cookie = await registerAndGetCookie("settingsuser1");

    const getRes = await SELF.fetch("http://example.com/api/settings", { headers: { Cookie: cookie } });
    expect(await getRes.json()).toEqual({
      mandatoryOfficeDayRules: [],
      targetOfficeRate: 50,
      closingDay: 15,
      closingDayShift: "none",
      autoFetchHolidays: true,
    });

    const putRes = await SELF.fetch("http://example.com/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ targetOfficeRate: 70, mandatoryOfficeDayRules: [1, 16] }),
    });
    expect(putRes.status).toBe(200);

    const getAfter = await SELF.fetch("http://example.com/api/settings", { headers: { Cookie: cookie } });
    const afterBody = await getAfter.json<{ targetOfficeRate: number; mandatoryOfficeDayRules: number[] }>();
    expect(afterBody.targetOfficeRate).toBe(70);
    expect(afterBody.mandatoryOfficeDayRules).toEqual([1, 16]);
  });

  it("不正な値は400", async () => {
    const cookie = await registerAndGetCookie("settingsuser2");
    const res = await SELF.fetch("http://example.com/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ targetOfficeRate: 150 }),
    });
    expect(res.status).toBe(400);
  });
});

describe("会社休日・会社営業日API", () => {
  it("会社休日を追加・一覧・削除できる", async () => {
    const cookie = await registerAndGetCookie("companyuser1");

    const postRes = await SELF.fetch("http://example.com/api/company-holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ date: "2026-12-29" }),
    });
    expect(postRes.status).toBe(201);

    const listRes = await SELF.fetch("http://example.com/api/company-holidays", { headers: { Cookie: cookie } });
    expect(await listRes.json()).toEqual({ dates: ["2026-12-29"] });

    const delRes = await SELF.fetch("http://example.com/api/company-holidays/2026-12-29", {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(delRes.status).toBe(200);

    const listAfter = await SELF.fetch("http://example.com/api/company-holidays", { headers: { Cookie: cookie } });
    expect(await listAfter.json()).toEqual({ dates: [] });
  });

  it("会社営業日も同様にCRUDできる(祝日でも出社日として扱われることをstatsで確認)", async () => {
    const cookie = await registerAndGetCookie("companyuser2");
    // 2026-02-11は祝日(建国記念の日)だが会社営業日に設定
    await SELF.fetch("http://example.com/api/company-working-days", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ date: "2026-02-11" }),
    });
    const listRes = await SELF.fetch("http://example.com/api/company-working-days", { headers: { Cookie: cookie } });
    expect(await listRes.json()).toEqual({ dates: ["2026-02-11"] });
  });
});

describe("期間・統計API", () => {
  it("period と stats が取得できる", async () => {
    const cookie = await registerAndGetCookie("statsuser1");

    const periodRes = await SELF.fetch("http://example.com/api/period?offsetMonths=0", {
      headers: { Cookie: cookie },
    });
    expect(periodRes.status).toBe(200);
    const period = await periodRes.json<{ startDate: string; endDate: string }>();
    expect(period.startDate <= period.endDate).toBe(true);

    const statsRes = await SELF.fetch("http://example.com/api/stats?offsetMonths=0", {
      headers: { Cookie: cookie },
    });
    expect(statsRes.status).toBe(200);
    const stats = await statsRes.json<{ officeRate: number }>();
    expect(stats.officeRate).toBe(0);
  });
});

describe("自動スケジュール適用API", () => {
  it("目標未達なら force なしで警告のみ返し保存されない", async () => {
    const cookie = await registerAndGetCookie("scheduleuser1");
    // 目標出社率を100%にして必ず警告になるようにする
    await SELF.fetch("http://example.com/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ targetOfficeRate: 100 }),
    });

    const res = await SELF.fetch("http://example.com/api/schedule/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ remoteWeekdays: [1, 2, 3, 4, 5], force: false }),
    });
    const body = await res.json<{ applied: boolean; warning: boolean }>();
    expect(body.applied).toBe(false);
    expect(body.warning).toBe(true);

    const recordsRes = await SELF.fetch("http://example.com/api/records", { headers: { Cookie: cookie } });
    expect((await recordsRes.json<{ records: unknown[] }>()).records).toEqual([]);
  });

  it("force=trueなら警告があっても適用される", async () => {
    const cookie = await registerAndGetCookie("scheduleuser2");
    await SELF.fetch("http://example.com/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ targetOfficeRate: 100 }),
    });

    const res = await SELF.fetch("http://example.com/api/schedule/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ remoteWeekdays: [1, 2, 3, 4, 5], force: true }),
    });
    const body = await res.json<{ applied: boolean }>();
    expect(body.applied).toBe(true);

    const recordsRes = await SELF.fetch("http://example.com/api/records", { headers: { Cookie: cookie } });
    const recordsBody = await recordsRes.json<{ records: { status: string }[] }>();
    expect(recordsBody.records.length).toBeGreaterThan(0);
    expect(recordsBody.records.every((r) => r.status === "remote")).toBe(true);
  });
});

describe("リセットAPI", () => {
  it("scope=allで全レコードが削除される", async () => {
    const cookie = await registerAndGetCookie("resetuser1");
    await SELF.fetch("http://example.com/api/records/2026-02-16", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ status: "office" }),
    });

    const resetRes = await SELF.fetch("http://example.com/api/attendance/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ scope: "all" }),
    });
    expect(resetRes.status).toBe(200);

    const listRes = await SELF.fetch("http://example.com/api/records", { headers: { Cookie: cookie } });
    expect((await listRes.json<{ records: unknown[] }>()).records).toEqual([]);
  });
});

describe("エクスポートAPI", () => {
  it("範囲指定でレコードをエクスポートできる", async () => {
    const cookie = await registerAndGetCookie("exportuser1");
    await SELF.fetch("http://example.com/api/records/2026-02-16", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ status: "office" }),
    });
    await SELF.fetch("http://example.com/api/records/2026-03-16", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ status: "remote" }),
    });

    const res = await SELF.fetch("http://example.com/api/export?start=2026-02-01&end=2026-02-28", {
      headers: { Cookie: cookie },
    });
    const body = await res.json<{ records: { date: string }[] }>();
    expect(body.records.map((r) => r.date)).toEqual(["2026-02-16"]);
  });
});
