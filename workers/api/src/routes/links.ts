import { Hono } from "hono";
import {
  acceptLinkRequest,
  cancelLinkRequest,
  createLinkRequest,
  getLinkState,
  leaveLink,
  LinkError,
  rejectLinkRequest,
  removeMember,
} from "../lib/links";
import { requireAccessAuth } from "../middleware/accessAuth";
import type { AppEnv } from "../types";

/**
 * アカウント連携の申請・承認・解除API。
 * 連携そのものを操作するルートなので、リゾルバ(withCalendarOwner)は通さず、
 * 常に「認証済みメール(userId)」本人として扱う。
 */
const links = new Hono<AppEnv>();
links.use("*", requireAccessAuth);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

/** 連携の全状態(自分のメンバー・所属先・受信/送信申請)を返す */
links.get("/", async (c) => {
  const state = await getLinkState(c.env.DB, c.get("userId"));
  return c.json(state);
});

/** 連携申請を送る。requester=自分、target=body.targetEmail */
links.post("/requests", async (c) => {
  const body = await c.req.json<{ targetEmail?: string }>();
  const target = normalizeEmail(body.targetEmail);
  if (!target) {
    return c.json({ error: "有効なメールアドレスを入力してください" }, 400);
  }
  try {
    await createLinkRequest(c.env.DB, c.get("userId"), target);
  } catch (err) {
    if (err instanceof LinkError) return c.json({ error: err.message }, 400);
    throw err;
  }
  return c.json({ ok: true }, 201);
});

/** 自分が送った申請を取り消す(target を指定) */
links.delete("/requests/:target", async (c) => {
  const target = normalizeEmail(c.req.param("target"));
  if (!target) return c.json({ error: "メールアドレスが不正です" }, 400);
  await cancelLinkRequest(c.env.DB, c.get("userId"), target);
  return c.json({ ok: true });
});

/** 自分宛の申請を承認する(requester を指定) */
links.post("/incoming/:requester/accept", async (c) => {
  const requester = normalizeEmail(c.req.param("requester"));
  if (!requester) return c.json({ error: "メールアドレスが不正です" }, 400);
  try {
    await acceptLinkRequest(c.env.DB, c.get("userId"), requester);
  } catch (err) {
    if (err instanceof LinkError) return c.json({ error: err.message }, 400);
    throw err;
  }
  return c.json({ ok: true });
});

/** 自分宛の申請を却下する(requester を指定) */
links.post("/incoming/:requester/reject", async (c) => {
  const requester = normalizeEmail(c.req.param("requester"));
  if (!requester) return c.json({ error: "メールアドレスが不正です" }, 400);
  await rejectLinkRequest(c.env.DB, c.get("userId"), requester);
  return c.json({ ok: true });
});

/** 所有者として、参加中のメンバーを解除する */
links.delete("/members/:member", async (c) => {
  const member = normalizeEmail(c.req.param("member"));
  if (!member) return c.json({ error: "メールアドレスが不正です" }, 400);
  await removeMember(c.env.DB, c.get("userId"), member);
  return c.json({ ok: true });
});

/** メンバーとして、自分の参加を解除して離脱する */
links.delete("/membership", async (c) => {
  await leaveLink(c.env.DB, c.get("userId"));
  return c.json({ ok: true });
});

export { links as linkRoutes };
