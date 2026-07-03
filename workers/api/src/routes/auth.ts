import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  generateSalt,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  saltToBase64,
  verifyPassword,
} from "../lib/auth";
import {
  countRecentFailedAttempts,
  createSession,
  createUser,
  deleteSession,
  findUserById,
  recordLoginAttempt,
} from "../lib/db";
import { requireAuth } from "../middleware/requireAuth";
import type { AppEnv } from "../types";

// Cloudflare Workers FreeプランはリクエストあたりCPU時間10msの制限がある。
// PBKDF2-SHA256は約0.4ms/1000回反復のペースで増加することを実測済み(vitest-pool-workers上)。
// 15,000回なら約6msに収まり、他の処理オーバーヘッドを含めても10ms以内に収まる見込み。
// OWASP推奨値(600,000回)より大幅に低いが、Freeプランで完全無料運用するためのトレードオフとして許容する。
const PASSWORD_ITERATIONS = 15_000;
const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14日
const MAX_FAILED_ATTEMPTS = 5;
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

const cookieSecure = (url: string) => new URL(url).protocol === "https:";

const auth = new Hono<AppEnv>();

auth.post("/register", async (c) => {
  const body = await c.req.json<{ userId?: string; password?: string; email?: string }>();
  const userId = body.userId?.trim() ?? "";
  const password = body.password ?? "";
  const email = body.email?.trim() || null;

  if (!USER_ID_PATTERN.test(userId)) {
    return c.json(
      { error: "IDは英数字・ハイフン・アンダースコアで3〜32文字にしてください" },
      400,
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` }, 400);
  }

  const existing = await findUserById(c.env.DB, userId);
  if (existing) {
    return c.json({ error: "このIDは既に使用されています" }, 409);
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt, PASSWORD_ITERATIONS);

  try {
    await createUser(c.env.DB, {
      userId,
      email,
      passwordHash,
      passwordSalt: saltToBase64(salt),
      passwordIterations: PASSWORD_ITERATIONS,
    });
  } catch {
    return c.json({ error: "このIDは既に使用されています" }, 409);
  }

  const token = generateSessionToken();
  await createSession(c.env.DB, {
    tokenHash: await hashSessionToken(token),
    userId,
    ttlSeconds: SESSION_TTL_SECONDS,
  });

  setCookie(c, "session", token, {
    httpOnly: true,
    secure: cookieSecure(c.req.url),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return c.json({ userId }, 201);
});

auth.post("/login", async (c) => {
  const body = await c.req.json<{ userId?: string; password?: string }>();
  const userId = body.userId?.trim() ?? "";
  const password = body.password ?? "";

  const user = await findUserById(c.env.DB, userId);
  if (!user) {
    // ユーザー不在時も一定の処理時間をかけ、存在有無の推測を難しくする
    await hashPassword(password, generateSalt(), PASSWORD_ITERATIONS);
    return c.json({ error: "IDまたはパスワードが正しくありません" }, 401);
  }

  const failedAttempts = await countRecentFailedAttempts(c.env.DB, userId);
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    return c.json({ error: "試行回数が上限に達しました。しばらく待ってから再試行してください" }, 429);
  }

  const valid = await verifyPassword(
    password,
    user.password_hash,
    user.password_salt,
    user.password_iterations,
  );
  await recordLoginAttempt(c.env.DB, userId, valid);

  if (!valid) {
    return c.json({ error: "IDまたはパスワードが正しくありません" }, 401);
  }

  const token = generateSessionToken();
  await createSession(c.env.DB, {
    tokenHash: await hashSessionToken(token),
    userId,
    ttlSeconds: SESSION_TTL_SECONDS,
  });

  setCookie(c, "session", token, {
    httpOnly: true,
    secure: cookieSecure(c.req.url),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return c.json({ userId });
});

auth.post("/logout", requireAuth, async (c) => {
  const token = getCookie(c, "session");
  if (token) {
    await deleteSession(c.env.DB, await hashSessionToken(token));
  }
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", requireAuth, async (c) => {
  const user = await findUserById(c.env.DB, c.get("userId"));
  if (!user) {
    return c.json({ error: "ユーザーが見つかりません" }, 404);
  }
  return c.json({ userId: user.user_id, email: user.email });
});

export { auth as authRoutes };
