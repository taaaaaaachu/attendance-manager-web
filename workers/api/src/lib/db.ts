export interface UserRow {
  user_id: string;
  email: string | null;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  token_hash: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function findUserById(db: D1Database, userId: string): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT * FROM users WHERE user_id = ?")
    .bind(userId)
    .first<UserRow>();
  return row ?? null;
}

export async function createUser(
  db: D1Database,
  params: {
    userId: string;
    email: string | null;
    passwordHash: string;
    passwordSalt: string;
    passwordIterations: number;
  },
): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO users (user_id, email, password_hash, password_salt, password_iterations, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      params.userId,
      params.email,
      params.passwordHash,
      params.passwordSalt,
      params.passwordIterations,
      now,
      now,
    )
    .run();

  // 初期設定行も同時に作成しておく(records/settings APIが常に1行存在する前提で読める)
  await db
    .prepare(
      `INSERT INTO user_settings (user_id, mandatory_office_day_rules, target_office_rate, closing_day, closing_day_shift, auto_fetch_holidays, updated_at)
       VALUES (?, '[]', 50, 15, 'none', 1, ?)`,
    )
    .bind(params.userId, now)
    .run();
}

export async function createSession(
  db: D1Database,
  params: { tokenHash: string; userId: string; ttlSeconds: number },
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + params.ttlSeconds * 1000);
  await db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    )
    .bind(params.tokenHash, params.userId, now.toISOString(), expiresAt.toISOString())
    .run();
}

export async function findSessionByTokenHash(
  db: D1Database,
  tokenHash: string,
): Promise<SessionRow | null> {
  const row = await db
    .prepare("SELECT * FROM sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .first<SessionRow>();
  return row ?? null;
}

export async function deleteSession(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export async function recordLoginAttempt(
  db: D1Database,
  userId: string,
  success: boolean,
): Promise<void> {
  await db
    .prepare("INSERT INTO login_attempts (user_id, attempted_at, success) VALUES (?, ?, ?)")
    .bind(userId, nowIso(), success ? 1 : 0)
    .run();
}

/** 直近5分間の失敗回数を返す(ブルートフォース対策のレート制限に使う) */
export async function countRecentFailedAttempts(db: D1Database, userId: string): Promise<number> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT COUNT(*) as count FROM login_attempts
       WHERE user_id = ? AND success = 0 AND attempted_at > ?`,
    )
    .bind(userId, fiveMinutesAgo)
    .first<{ count: number }>();
  return row?.count ?? 0;
}
