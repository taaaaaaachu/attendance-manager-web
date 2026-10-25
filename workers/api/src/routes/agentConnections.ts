import { Hono } from "hono";
import {
  issueManualConnection,
  listAgentConnections,
  normalizeAgentName,
  revokeAgentConnection,
} from "../lib/agentConnections";
import { requireAccessAuth } from "../middleware/accessAuth";
import type { AppEnv } from "../types";

/**
 * 本人のエージェント接続の一覧・手動発行・取り消し(ADR 0004)。画面向けなのでAccessで認証する。
 * 接続はカレンダーではなく発行者に結びつくため、リゾルバ(withCalendarOwner)は通さない。
 */
const agentConnections = new Hono<AppEnv>();
agentConnections.use("*", requireAccessAuth);

agentConnections.get("/", async (c) => {
  return c.json({ connections: await listAgentConnections(c.env.DB, c.get("userId")) });
});

agentConnections.post("/", async (c) => {
  const body = await c.req.json<{ name?: unknown }>().catch(() => ({ name: undefined }));
  const name = normalizeAgentName(body.name);
  if (!name) return c.json({ error: "名前は1〜50文字で入力してください" }, 400);
  // トークンはこの応答でしか分からない(D1にはハッシュだけを保存する)
  return c.json(await issueManualConnection(c.env.DB, c.get("userId"), name), 201);
});

agentConnections.delete("/:id", async (c) => {
  const revoked = await revokeAgentConnection(c.env.DB, c.req.param("id"), c.get("userId"));
  if (!revoked) return c.json({ error: "接続が見つかりません" }, 404);
  return c.json({ ok: true });
});

export { agentConnections as agentConnectionRoutes };
