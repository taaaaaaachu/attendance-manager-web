import { Hono } from "hono";
import { countIncomingRequests, resolveCalendarOwner } from "../lib/links";
import { requireAccessAuth } from "../middleware/accessAuth";
import { isAdminEmail } from "../middleware/adminAuth";
import type { AppEnv } from "../types";

const auth = new Hono<AppEnv>();

// Cloudflare Accessのセッション切れからの復帰用。フロントのapiFetchが認証リダイレクト
// (opaqueredirect)を検出したらここへトップレベル遷移し、Access認証後にトップページへ戻す。
// Access層自体がこのルートを保護するため、アプリ側の認証チェックは不要。
// PWAのService Workerにキャッシュを返されないよう、navigateFallbackDenylist対象の/api/配下に置く。
auth.get("/refresh", (c) => {
  return c.redirect("/", 302);
});

auth.get("/me", requireAccessAuth, async (c) => {
  const email = c.get("userId");
  const [owner, incomingRequestCount] = await Promise.all([
    resolveCalendarOwner(c.env.DB, email),
    countIncomingRequests(c.env.DB, email),
  ]);
  return c.json({
    userId: email,
    email,
    isAdmin: isAdminEmail(c.env.ADMIN_EMAILS, email),
    // 連携メンバーとしてログイン中なら共有カレンダー所有者のメール、そうでなければ null
    linkedTo: owner === email ? null : owner,
    incomingRequestCount,
  });
});

export { auth as authRoutes };
