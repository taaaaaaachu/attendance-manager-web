import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { hashSessionToken } from "../lib/auth";
import { findSessionByTokenHash } from "../lib/db";
import type { AppEnv } from "../types";

function extractBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length);
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, "session") ?? extractBearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "認証が必要です" }, 401);
  }

  const tokenHash = await hashSessionToken(token);
  const session = await findSessionByTokenHash(c.env.DB, tokenHash);
  if (!session || session.expires_at < new Date().toISOString()) {
    return c.json({ error: "セッションが無効です" }, 401);
  }

  c.set("userId", session.user_id);
  await next();
});
