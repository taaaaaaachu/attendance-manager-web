import { createMcpHandler } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import { authenticateAgent } from "../lib/agentConnections";
import { resolveCalendarOwner } from "../lib/links";
import { createMcpServer } from "../lib/mcp";
import type { AppEnv } from "../types";
import { issuerOf } from "./oauth";

/**
 * エージェント向けのMCPエンドポイント(ADR 0004)。Cloudflare AccessをBypassするパスなので
 * requireAccessAuth は通さず、毎リクエスト Bearer トークン(手動発行・OAuth)だけで接続を確かめる。
 * セッションは持たない(ステートレス)。トークンはこのエンドポイント以外では受け付けない。
 */

/** 401で認可サーバーの在処を知らせる(RFC 9728) */
function unauthorized(url: string): Response {
  const metadata = `${issuerOf(url)}/.well-known/oauth-protected-resource/mcp`;
  return Response.json(
    { error: "invalid_token", error_description: "エージェント接続のトークンが必要です。" },
    { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${metadata}"` } },
  );
}

export const mcpRoutes = new Hono<AppEnv>();

mcpRoutes.all("/", async (c) => {
  const token = c.req.header("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const agent = token ? await authenticateAgent(c.env.DB, token) : null;
  if (!token || !agent) return unauthorized(c.req.url);
  // 接続には操作先のカレンダーを持たせず、画面と同じくアカウント連携でその都度解決する
  const owner = await resolveCalendarOwner(c.env.DB, agent.userEmail);
  const handler = createMcpHandler(() => createMcpServer(c.env.DB, owner));
  return handler.fetch(c.req.raw, { authInfo: { token, clientId: agent.connectionId, scopes: [] } });
});
