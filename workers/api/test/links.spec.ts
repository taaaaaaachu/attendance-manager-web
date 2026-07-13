import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { authHeaders, mockAccessCerts } from "./helpers/access";
import { applyMigrations } from "./helpers/migrations";

beforeAll(async () => {
  await applyMigrations(env.DB);
  await mockAccessCerts();
});

async function jsonHeaders(email: string): Promise<Record<string, string>> {
  return authHeaders(email, { "Content-Type": "application/json" });
}

/** A→Bに申請を送る */
function sendRequest(from: string, target: string): Promise<Response> {
  return jsonHeaders(from).then((headers) =>
    SELF.fetch("http://example.com/api/links/requests", {
      method: "POST",
      headers,
      body: JSON.stringify({ targetEmail: target }),
    }),
  );
}

/** Bが requester からの申請を承認する */
async function accept(as: string, requester: string): Promise<Response> {
  return SELF.fetch(`http://example.com/api/links/incoming/${encodeURIComponent(requester)}/accept`, {
    method: "POST",
    headers: await authHeaders(as),
  });
}

async function putRecord(email: string, date: string, status: string): Promise<Response> {
  return SELF.fetch(`http://example.com/api/records/${date}`, {
    method: "PUT",
    headers: await jsonHeaders(email),
    body: JSON.stringify({ status }),
  });
}

async function listRecords(email: string): Promise<{ date: string; status: string }[]> {
  const res = await SELF.fetch("http://example.com/api/records", { headers: await authHeaders(email) });
  return (await res.json<{ records: { date: string; status: string }[] }>()).records;
}

async function getMe(email: string) {
  const res = await SELF.fetch("http://example.com/api/auth/me", { headers: await authHeaders(email) });
  return res.json<{ linkedTo: string | null; incomingRequestCount: number }>();
}

describe("連携申請〜承認の基本フロー", () => {
  it("承認後、メンバーのログインでは所有者のカレンダーが読み書きされる", async () => {
    const owner = "flow-owner@example.com";
    const member = "flow-member@example.com";

    // 所有者Aが先に記録を持っている
    await putRecord(owner, "2026-05-01", "office");

    // A→B 申請、Bが承認
    expect((await sendRequest(owner, member)).status).toBe(201);
    expect((await accept(member, owner)).status).toBe(200);

    // メンバーBのログインでAのカレンダーがそのままAのカレンダーとして見える
    expect(await listRecords(member)).toEqual([
      { date: "2026-05-01", status: "office", updatedAt: expect.any(String) },
    ]);

    // Bが記録するとAのカレンダーに入る(Aのログインでも見える)
    await putRecord(member, "2026-05-02", "remote");
    const asOwner = await listRecords(owner);
    expect(asOwner.map((r) => r.date)).toEqual(["2026-05-01", "2026-05-02"]);
  });

  it("/api/auth/me の linkedTo にメンバーの所有者が反映される", async () => {
    const owner = "me-owner@example.com";
    const member = "me-member@example.com";
    await sendRequest(owner, member);
    await accept(member, owner);

    expect((await getMe(member)).linkedTo).toBe(owner);
    expect((await getMe(owner)).linkedTo).toBeNull();
  });
});

describe("休眠データと可逆性", () => {
  it("連携中はメンバー自身の既存データが隠れ、解除で復活する", async () => {
    const owner = "dorm-owner@example.com";
    const member = "dorm-member@example.com";

    // Bは連携前に自分のデータを持っている
    await putRecord(member, "2026-06-10", "paidleave");
    await putRecord(owner, "2026-06-11", "office");

    await sendRequest(owner, member);
    await accept(member, owner);

    // 連携中、Bのログインでは自分の6-10ではなくAの6-11が見える
    expect((await listRecords(member)).map((r) => r.date)).toEqual(["2026-06-11"]);

    // Bが離脱すると自分の休眠データが復活する
    const leave = await SELF.fetch("http://example.com/api/links/membership", {
      method: "DELETE",
      headers: await authHeaders(member),
    });
    expect(leave.status).toBe(200);
    expect((await listRecords(member)).map((r) => r.date)).toEqual(["2026-06-10"]);

    // Aのカレンダーは影響を受けない
    expect((await listRecords(owner)).map((r) => r.date)).toEqual(["2026-06-11"]);
  });
});

describe("申請・連携の制約(フラット・スター維持)", () => {
  it("自分自身への申請は400", async () => {
    const res = await sendRequest("self@example.com", "self@example.com");
    expect(res.status).toBe(400);
  });

  it("同じ相手への重複申請は400", async () => {
    const a = "dup-a@example.com";
    const b = "dup-b@example.com";
    expect((await sendRequest(a, b)).status).toBe(201);
    expect((await sendRequest(a, b)).status).toBe(400);
  });

  it("既にメンバーの相手には申請できない(多重参加の禁止)", async () => {
    const owner = "multi-owner@example.com";
    const member = "multi-member@example.com";
    await sendRequest(owner, member);
    await accept(member, owner);

    // 別のAが同じmemberを誘っても400
    const res = await sendRequest("multi-other@example.com", member);
    expect(res.status).toBe(400);
  });

  it("自分が別カレンダーに参加中だと申請できない(連鎖の禁止)", async () => {
    const owner = "chain-owner@example.com";
    const member = "chain-member@example.com";
    await sendRequest(owner, member);
    await accept(member, owner);

    // memberが更に誰かを誘おうとすると400
    const res = await sendRequest(member, "chain-victim@example.com");
    expect(res.status).toBe(400);
  });

  it("相手が所有者(メンバーを抱える)なら申請できない", async () => {
    const owner = "grpowner@example.com";
    const member = "grpmember@example.com";
    await sendRequest(owner, member);
    await accept(member, owner);

    // ownerは既にメンバーを持つ所有者。別のAがownerを誘っても400
    const res = await sendRequest("grpouter@example.com", owner);
    expect(res.status).toBe(400);
  });
});

describe("申請の取消・却下", () => {
  it("送信者は申請を取り消せる", async () => {
    const a = "cancel-a@example.com";
    const b = "cancel-b@example.com";
    await sendRequest(a, b);

    const cancel = await SELF.fetch(`http://example.com/api/links/requests/${encodeURIComponent(b)}`, {
      method: "DELETE",
      headers: await authHeaders(a),
    });
    expect(cancel.status).toBe(200);
    // 取消後は受信側の件数が0
    expect((await getMe(b)).incomingRequestCount).toBe(0);
    // 取消後は再申請できる
    expect((await sendRequest(a, b)).status).toBe(201);
  });

  it("受信者は申請を却下でき、承認はできなくなる", async () => {
    const a = "rej-a@example.com";
    const b = "rej-b@example.com";
    await sendRequest(a, b);
    expect((await getMe(b)).incomingRequestCount).toBe(1);

    const reject = await SELF.fetch(`http://example.com/api/links/incoming/${encodeURIComponent(a)}/reject`, {
      method: "POST",
      headers: await authHeaders(b),
    });
    expect(reject.status).toBe(200);
    expect((await getMe(b)).incomingRequestCount).toBe(0);
    // 却下済みなので承認しようとしても400
    expect((await accept(b, a)).status).toBe(400);
  });
});

describe("解除", () => {
  it("所有者はメンバーを解除できる", async () => {
    const owner = "rm-owner@example.com";
    const member = "rm-member@example.com";
    await sendRequest(owner, member);
    await accept(member, owner);
    expect((await getMe(member)).linkedTo).toBe(owner);

    const remove = await SELF.fetch(`http://example.com/api/links/members/${encodeURIComponent(member)}`, {
      method: "DELETE",
      headers: await authHeaders(owner),
    });
    expect(remove.status).toBe(200);
    expect((await getMe(member)).linkedTo).toBeNull();
  });
});

describe("連携状態の取得", () => {
  it("GET /api/links が所有メンバー・受信/送信申請を返す", async () => {
    const owner = "state-owner@example.com";
    const member = "state-member@example.com";
    const pendingTarget = "state-pending@example.com";
    await sendRequest(owner, member);
    await accept(member, owner);
    await sendRequest(owner, pendingTarget);

    const res = await SELF.fetch("http://example.com/api/links", { headers: await authHeaders(owner) });
    const state = await res.json<{
      members: string[];
      owner: string | null;
      incoming: { email: string }[];
      outgoing: { email: string }[];
    }>();
    expect(state.members).toEqual([member]);
    expect(state.owner).toBeNull();
    expect(state.outgoing.map((r) => r.email)).toEqual([pendingTarget]);
    expect(state.incoming).toEqual([]);
  });
});
