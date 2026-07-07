import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { authHeaders, mockAccessCerts } from "./helpers/access";
import { applyMigrations } from "./helpers/migrations";

beforeAll(async () => {
  await applyMigrations(env.DB);
  await mockAccessCerts();
});

/** JSONボディ付きリクエスト用のヘッダを作る */
async function jsonHeaders(email: string): Promise<Record<string, string>> {
  return authHeaders(email, { "Content-Type": "application/json" });
}

describe("勤怠レコードCRUD", () => {
  it("PUT → GET → DELETE の一連の流れが通る", async () => {
    const email = "recuser1@example.com";

    const putRes = await SELF.fetch("http://example.com/api/records/2026-02-16", {
      method: "PUT",
      headers: await jsonHeaders(email),
      body: JSON.stringify({ status: "office" }),
    });
    expect(putRes.status).toBe(200);

    const listRes = await SELF.fetch("http://example.com/api/records", {
      headers: await authHeaders(email),
    });
    const listBody = await listRes.json<{ records: { date: string; status: string }[] }>();
    expect(listBody.records).toEqual([{ date: "2026-02-16", status: "office", updatedAt: expect.any(String) }]);

    const delRes = await SELF.fetch("http://example.com/api/records/2026-02-16", {
      method: "DELETE",
      headers: await authHeaders(email),
    });
    expect(delRes.status).toBe(200);

    const listAfterDelete = await SELF.fetch("http://example.com/api/records", {
      headers: await authHeaders(email),
    });
    expect((await listAfterDelete.json<{ records: unknown[] }>()).records).toEqual([]);
  });

  it("ユーザー(メールアドレス)ごとにデータが分離される", async () => {
    await SELF.fetch("http://example.com/api/records/2026-02-17", {
      method: "PUT",
      headers: await jsonHeaders("isolation-a@example.com"),
      body: JSON.stringify({ status: "office" }),
    });

    const otherList = await SELF.fetch("http://example.com/api/records", {
      headers: await authHeaders("isolation-b@example.com"),
    });
    expect((await otherList.json<{ records: unknown[] }>()).records).toEqual([]);
  });

  it("不正なstatusは400", async () => {
    const res = await SELF.fetch("http://example.com/api/records/2026-02-16", {
      method: "PUT",
      headers: await jsonHeaders("recuser2@example.com"),
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
  it("GET はデフォルト値を返し、PUTで更新できる(行が無くてもupsertされる)", async () => {
    const email = "settingsuser1@example.com";

    const getRes = await SELF.fetch("http://example.com/api/settings", {
      headers: await authHeaders(email),
    });
    expect(await getRes.json()).toEqual({
      mandatoryOfficeDayRules: [],
      targetOfficeRate: 50,
      closingDay: 15,
      closingDayShift: "none",
      autoFetchHolidays: true,
    });

    const putRes = await SELF.fetch("http://example.com/api/settings", {
      method: "PUT",
      headers: await jsonHeaders(email),
      body: JSON.stringify({ targetOfficeRate: 70, mandatoryOfficeDayRules: [1, 16] }),
    });
    expect(putRes.status).toBe(200);

    const getAfter = await SELF.fetch("http://example.com/api/settings", {
      headers: await authHeaders(email),
    });
    const afterBody = await getAfter.json<{ targetOfficeRate: number; mandatoryOfficeDayRules: number[] }>();
    expect(afterBody.targetOfficeRate).toBe(70);
    expect(afterBody.mandatoryOfficeDayRules).toEqual([1, 16]);
  });

  it("不正な値は400", async () => {
    const res = await SELF.fetch("http://example.com/api/settings", {
      method: "PUT",
      headers: await jsonHeaders("settingsuser2@example.com"),
      body: JSON.stringify({ targetOfficeRate: 150 }),
    });
    expect(res.status).toBe(400);
  });
});

describe("会社休日・会社営業日API", () => {
  it("会社休日を追加・一覧・削除できる", async () => {
    const email = "companyuser1@example.com";

    const postRes = await SELF.fetch("http://example.com/api/company-holidays", {
      method: "POST",
      headers: await jsonHeaders(email),
      body: JSON.stringify({ date: "2026-12-29" }),
    });
    expect(postRes.status).toBe(201);

    const listRes = await SELF.fetch("http://example.com/api/company-holidays", {
      headers: await authHeaders(email),
    });
    expect(await listRes.json()).toEqual({ dates: ["2026-12-29"] });

    const delRes = await SELF.fetch("http://example.com/api/company-holidays/2026-12-29", {
      method: "DELETE",
      headers: await authHeaders(email),
    });
    expect(delRes.status).toBe(200);

    const listAfter = await SELF.fetch("http://example.com/api/company-holidays", {
      headers: await authHeaders(email),
    });
    expect(await listAfter.json()).toEqual({ dates: [] });
  });

  it("会社営業日も同様にCRUDできる", async () => {
    const email = "companyuser2@example.com";
    await SELF.fetch("http://example.com/api/company-working-days", {
      method: "POST",
      headers: await jsonHeaders(email),
      body: JSON.stringify({ date: "2026-02-11" }),
    });
    const listRes = await SELF.fetch("http://example.com/api/company-working-days", {
      headers: await authHeaders(email),
    });
    expect(await listRes.json()).toEqual({ dates: ["2026-02-11"] });
  });
});

describe("期間・統計API", () => {
  it("period と stats が取得できる", async () => {
    const email = "statsuser1@example.com";

    const periodRes = await SELF.fetch("http://example.com/api/period?offsetMonths=0", {
      headers: await authHeaders(email),
    });
    expect(periodRes.status).toBe(200);
    const period = await periodRes.json<{ startDate: string; endDate: string }>();
    expect(period.startDate <= period.endDate).toBe(true);

    const statsRes = await SELF.fetch("http://example.com/api/stats?offsetMonths=0", {
      headers: await authHeaders(email),
    });
    expect(statsRes.status).toBe(200);
    const stats = await statsRes.json<{ officeRate: number }>();
    expect(stats.officeRate).toBe(0);
  });
});

describe("自動スケジュール適用API", () => {
  it("目標未達なら force なしで警告のみ返し保存されない", async () => {
    const email = "scheduleuser1@example.com";
    // 目標出社率を100%にして必ず警告になるようにする
    await SELF.fetch("http://example.com/api/settings", {
      method: "PUT",
      headers: await jsonHeaders(email),
      body: JSON.stringify({ targetOfficeRate: 100 }),
    });

    const res = await SELF.fetch("http://example.com/api/schedule/apply", {
      method: "POST",
      headers: await jsonHeaders(email),
      body: JSON.stringify({ remoteWeekdays: [1, 2, 3, 4, 5], force: false }),
    });
    const body = await res.json<{ applied: boolean; warning: boolean }>();
    expect(body.applied).toBe(false);
    expect(body.warning).toBe(true);

    const recordsRes = await SELF.fetch("http://example.com/api/records", {
      headers: await authHeaders(email),
    });
    expect((await recordsRes.json<{ records: unknown[] }>()).records).toEqual([]);
  });

  it("force=trueなら警告があっても適用される", async () => {
    const email = "scheduleuser2@example.com";
    await SELF.fetch("http://example.com/api/settings", {
      method: "PUT",
      headers: await jsonHeaders(email),
      body: JSON.stringify({ targetOfficeRate: 100 }),
    });

    const res = await SELF.fetch("http://example.com/api/schedule/apply", {
      method: "POST",
      headers: await jsonHeaders(email),
      body: JSON.stringify({ remoteWeekdays: [1, 2, 3, 4, 5], force: true }),
    });
    const body = await res.json<{ applied: boolean }>();
    expect(body.applied).toBe(true);

    const recordsRes = await SELF.fetch("http://example.com/api/records", {
      headers: await authHeaders(email),
    });
    const recordsBody = await recordsRes.json<{ records: { status: string }[] }>();
    expect(recordsBody.records.length).toBeGreaterThan(0);
    expect(recordsBody.records.every((r) => r.status === "remote")).toBe(true);
  });
});

describe("リセットAPI", () => {
  it("scope=allで全レコードが削除される", async () => {
    const email = "resetuser1@example.com";
    await SELF.fetch("http://example.com/api/records/2026-02-16", {
      method: "PUT",
      headers: await jsonHeaders(email),
      body: JSON.stringify({ status: "office" }),
    });

    const resetRes = await SELF.fetch("http://example.com/api/attendance/reset", {
      method: "POST",
      headers: await jsonHeaders(email),
      body: JSON.stringify({ scope: "all" }),
    });
    expect(resetRes.status).toBe(200);

    const listRes = await SELF.fetch("http://example.com/api/records", {
      headers: await authHeaders(email),
    });
    expect((await listRes.json<{ records: unknown[] }>()).records).toEqual([]);
  });
});

describe("エクスポートAPI", () => {
  it("範囲指定でレコードをエクスポートできる", async () => {
    const email = "exportuser1@example.com";
    await SELF.fetch("http://example.com/api/records/2026-02-16", {
      method: "PUT",
      headers: await jsonHeaders(email),
      body: JSON.stringify({ status: "office" }),
    });
    await SELF.fetch("http://example.com/api/records/2026-03-16", {
      method: "PUT",
      headers: await jsonHeaders(email),
      body: JSON.stringify({ status: "remote" }),
    });

    const res = await SELF.fetch("http://example.com/api/export?start=2026-02-01&end=2026-02-28", {
      headers: await authHeaders(email),
    });
    const body = await res.json<{ records: { date: string }[] }>();
    expect(body.records.map((r) => r.date)).toEqual(["2026-02-16"]);
  });
});
