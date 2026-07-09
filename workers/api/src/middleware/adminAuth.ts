import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

/** 指定メールアドレスがADMIN_EMAILSに列挙された管理者かどうかを判定する */
export function isAdminEmail(adminEmailsEnv: string | undefined, email: string): boolean {
  return parseAdminEmails(adminEmailsEnv).has(email);
}

/** requireAccessAuthの後段で使う。管理者でなければ403を返す */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!isAdminEmail(c.env.ADMIN_EMAILS, c.get("userId"))) {
    return c.json({ error: "管理者権限が必要です" }, 403);
  }
  await next();
});
