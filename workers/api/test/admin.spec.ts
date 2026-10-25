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

/**
 * そのユーザーの今の期間内にある平日を1日返す。「今日」に記録すると、土日に実行したとき
 * 営業日でないため出社日数に数えられずテストが落ちる。設定(締め日)を変える場合は変えた後に呼ぶ。
 */
async function weekdayInCurrentPeriod(email: string): Promise<string> {
  const res = await SELF.fetch("http://example.com/api/period", { headers: await authHeaders(email) });
  const { startDate } = await res.json<{ startDate: string }>();
  const date = new Date(`${startDate}T00:00:00Z`);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
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

    await SELF.fetch("http://example.com/api/settings", {
      method: "PUT",
      headers: await jsonHeaders(userB),
      body: JSON.stringify({ targetOfficeRate: 80, closingDay: 20, closingDayShift: "previous" }),
    });
    await SELF.fetch(`http://example.com/api/records/${await weekdayInCurrentPeriod(userA)}`, {
      method: "PUT",
      headers: await jsonHeaders(userA),
      body: JSON.stringify({ status: "office" }),
    });
    await SELF.fetch(`http://example.com/api/records/${await weekdayInCurrentPeriod(userB)}`, {
      method: "PUT",
      headers: await jsonHeaders(userB),
      body: JSON.stringify({ status: "remote" }),
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
    const date = await weekdayInCurrentPeriod(user);
    await SELF.fetch(`http://example.com/api/records/${date}`, {
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
      expect.arrayContaining([expect.objectContaining({ date, status: "office" })]),
    );
    expect(body.stats.officeDays).toBeGreaterThanOrEqual(1);
  });
});

describe("DELETE /api/admin/users/:email", () => {
  it("管理者以外は403", async () => {
    const res = await SELF.fetch("http://example.com/api/admin/users/delete-target@example.com", {
      method: "DELETE",
      headers: await authHeaders("not-admin@example.com"),
    });
    expect(res.status).toBe(403);
  });

  it("現在ログイン中の管理者自身は削除できない", async () => {
    const admin = adminEmail();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO attendance_records (user_id, date, status, updated_at) VALUES (?, ?, ?, ?)",
    ).bind(admin, "2099-01-01", "office", new Date().toISOString()).run();

    const res = await SELF.fetch(`http://example.com/api/admin/users/${admin}`, {
      method: "DELETE",
      headers: await authHeaders(admin),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toContain("自身は削除できません");
  });

  it("存在しないユーザーは404", async () => {
    const res = await SELF.fetch("http://example.com/api/admin/users/no-such-delete-user@example.com", {
      method: "DELETE",
      headers: await authHeaders(adminEmail()),
    });
    expect(res.status).toBe(404);
  });

  it("所有者を削除すると所有者データと連携を削除し、メンバーの休眠データを保持する", async () => {
    const owner = "delete-owner@example.com";
    const member = "delete-owner-member@example.com";
    const now = new Date().toISOString();

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO attendance_records (user_id, date, status, updated_at) VALUES (?, ?, ?, ?)",
      ).bind(owner, "2099-02-01", "office", now),
      env.DB.prepare(
        "INSERT INTO attendance_records (user_id, date, status, updated_at) VALUES (?, ?, ?, ?)",
      ).bind(member, "2099-02-02", "remote", now),
      env.DB.prepare(
        "INSERT INTO user_settings (user_id, updated_at) VALUES (?, ?)",
      ).bind(owner, now),
      env.DB.prepare(
        "INSERT INTO user_settings (user_id, updated_at) VALUES (?, ?)",
      ).bind(member, now),
      env.DB.prepare(
        "INSERT INTO account_links (owner_email, member_email, created_at) VALUES (?, ?, ?)",
      ).bind(owner, member, now),
      env.DB.prepare(
        "INSERT INTO link_requests (requester_email, target_email, created_at) VALUES (?, ?, ?)",
      ).bind(owner, "pending-owner-target@example.com", now),
    ]);

    const res = await SELF.fetch(`http://example.com/api/admin/users/${owner}`, {
      method: "DELETE",
      headers: await authHeaders(adminEmail()),
    });
    expect(res.status).toBe(200);

    expect(await env.DB.prepare("SELECT 1 FROM attendance_records WHERE user_id = ?").bind(owner).first()).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM user_settings WHERE user_id = ?").bind(owner).first()).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM attendance_records WHERE user_id = ?").bind(member).first()).not.toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM user_settings WHERE user_id = ?").bind(member).first()).not.toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM account_links WHERE owner_email = ? OR member_email = ?").bind(owner, owner).first()).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM link_requests WHERE requester_email = ? OR target_email = ?").bind(owner, owner).first()).toBeNull();
  });

  it("メンバーを削除するとメンバーのデータと連携を削除し、所有者データを保持する", async () => {
    const owner = "delete-member-owner@example.com";
    const member = "delete-member@example.com";
    const now = new Date().toISOString();

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO attendance_records (user_id, date, status, updated_at) VALUES (?, ?, ?, ?)",
      ).bind(owner, "2099-03-01", "office", now),
      env.DB.prepare(
        "INSERT INTO attendance_records (user_id, date, status, updated_at) VALUES (?, ?, ?, ?)",
      ).bind(member, "2099-03-02", "remote", now),
      env.DB.prepare(
        "INSERT INTO account_links (owner_email, member_email, created_at) VALUES (?, ?, ?)",
      ).bind(owner, member, now),
    ]);

    const res = await SELF.fetch(`http://example.com/api/admin/users/${member}`, {
      method: "DELETE",
      headers: await authHeaders(adminEmail()),
    });
    expect(res.status).toBe(200);
    expect(await env.DB.prepare("SELECT 1 FROM attendance_records WHERE user_id = ?").bind(member).first()).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM attendance_records WHERE user_id = ?").bind(owner).first()).not.toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM account_links WHERE owner_email = ? OR member_email = ?").bind(member, member).first()).toBeNull();
  });
});
