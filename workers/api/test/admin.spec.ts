import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { authHeaders, mockAccessCerts } from "./helpers/access";
import { applyMigrations } from "./helpers/migrations";

beforeAll(async () => {
  await applyMigrations(env.DB);
  await mockAccessCerts();
});

function adminEmail(): string {
  return env.ADMIN_EMAILS.split(",")[0];
}

async function jsonHeaders(email: string): Promise<Record<string, string>> {
  return authHeaders(email, { "Content-Type": "application/json" });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("GET /api/admin/users", () => {
  it("未認証は401", async () => {
    const res = await SELF.fetch("http://example.com/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("管理者以外は403", async () => {
    const res = await SELF.fetch("http://example.com/api/admin/users", {
      headers: await authHeaders("not-admin@example.com"),
    });
    expect(res.status).toBe(403);
  });

  it("管理者は勤怠記録を持つ全ユーザーの一覧を取得できる", async () => {
    const userA = "admin-list-a@example.com";
    const userB = "admin-list-b@example.com";

    await SELF.fetch(`http://example.com/api/records/${todayStr()}`, {
      method: "PUT",
      headers: await jsonHeaders(userA),
      body: JSON.stringify({ status: "office" }),
    });
    await SELF.fetch(`http://example.com/api/records/${todayStr()}`, {
      method: "PUT",
      headers: await jsonHeaders(userB),
      body: JSON.stringify({ status: "remote" }),
    });
    await SELF.fetch("http://example.com/api/settings", {
      method: "PUT",
      headers: await jsonHeaders(userB),
      body: JSON.stringify({ targetOfficeRate: 80, closingDay: 20, closingDayShift: "previous" }),
    });

    const res = await SELF.fetch("http://example.com/api/admin/users?offsetMonths=0", {
      headers: await authHeaders(adminEmail()),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{
      users: {
        userId: string;
        closingDay: number;
        closingDayShift: string;
        targetOfficeRate: number;
        stats: { officeDays: number; remoteDays: number };
      }[];
    }>();

    const a = body.users.find((u) => u.userId === userA);
    const b = body.users.find((u) => u.userId === userB);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a?.stats.officeDays).toBeGreaterThanOrEqual(1);
    expect(b?.stats.remoteDays).toBeGreaterThanOrEqual(1);
    expect(b).toMatchObject({ closingDay: 20, closingDayShift: "previous", targetOfficeRate: 80 });
  });

  it("記録が1件もないユーザーは一覧に現れない", async () => {
    const res = await SELF.fetch("http://example.com/api/admin/users", {
      headers: await authHeaders(adminEmail()),
    });
    const body = await res.json<{ users: { userId: string }[] }>();
    expect(body.users.some((u) => u.userId === "nobody-ever-recorded@example.com")).toBe(false);
  });
});

describe("GET /api/admin/users/:email/records", () => {
  it("管理者以外は403", async () => {
    const res = await SELF.fetch("http://example.com/api/admin/users/foo@example.com/records", {
      headers: await authHeaders("not-admin@example.com"),
    });
    expect(res.status).toBe(403);
  });

  it("存在しないユーザーは404", async () => {
    const res = await SELF.fetch(
      "http://example.com/api/admin/users/never-existed@example.com/records",
      { headers: await authHeaders(adminEmail()) },
    );
    expect(res.status).toBe(404);
  });

  it("管理者は指定ユーザーの記録を読み取り専用で閲覧できる", async () => {
    const user = "admin-detail-user@example.com";
    await SELF.fetch(`http://example.com/api/records/${todayStr()}`, {
      method: "PUT",
      headers: await jsonHeaders(user),
      body: JSON.stringify({ status: "office" }),
    });

    const res = await SELF.fetch(
      `http://example.com/api/admin/users/${user}/records?offsetMonths=0`,
      { headers: await authHeaders(adminEmail()) },
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      userId: string;
      records: { date: string; status: string }[];
      stats: { officeDays: number };
    }>();
    expect(body.userId).toBe(user);
    expect(body.records).toEqual(
      expect.arrayContaining([expect.objectContaining({ date: todayStr(), status: "office" })]),
    );
    expect(body.stats.officeDays).toBeGreaterThanOrEqual(1);
  });
});
