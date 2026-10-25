/**
 * エージェント接続(ADR 0004)。1件の接続は発行者のメールアドレス1つに結びつく。
 * 操作先のカレンダーは接続には持たせず、使うたびにアカウント連携で解決する。
 * トークンはすべてSHA-256のハッシュだけをD1に保存する。
 */

/** この期間使われなかった接続は失効する */
export const AGENT_IDLE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** OAuthのアクセストークンの寿命 */
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

export const AGENT_NAME_MAX = 50;

const iso = (ms: number) => new Date(ms).toISOString();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

/** 漏えい時にシークレットスキャンで見つけやすいよう接頭辞を付ける */
function newToken(prefix: "amw_" | "amwr_"): string {
  return prefix + randomToken();
}

/** 名前を整える。空・長すぎは null */
export function normalizeAgentName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= AGENT_NAME_MAX ? trimmed : null;
}

/** 手動発行。トークンは戻り値でしか分からない */
export async function issueManualConnection(
  db: D1Database,
  userEmail: string,
  name: string,
  now = Date.now(),
): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID();
  const token = newToken("amw_");
  await db
    .prepare(
      `INSERT INTO agent_connections (id, user_email, name, client_id, access_hash, access_expires_at, created_at, last_used_at)
       VALUES (?, ?, ?, NULL, ?, NULL, ?, ?)`,
    )
    .bind(id, userEmail, name, await sha256Hex(token), iso(now), iso(now))
    .run();
  return { id, token };
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

async function newOAuthTokens(now: number) {
  const accessToken = newToken("amw_");
  const refreshToken = newToken("amwr_");
  return {
    tokens: { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_MS / 1000 },
    accessHash: await sha256Hex(accessToken),
    accessExpiresAt: iso(now + ACCESS_TOKEN_TTL_MS),
    refreshHash: await sha256Hex(refreshToken),
  };
}

/**
 * OAuthの同意から接続を作る。同じ発行者・同じクライアントの既存の接続は置き換える
 * (繋ぎ直すたびに一覧へ溜まらないように)。
 */
export async function createOAuthConnection(
  db: D1Database,
  userEmail: string,
  clientId: string,
  name: string,
  now = Date.now(),
): Promise<OAuthTokens> {
  const t = await newOAuthTokens(now);
  await db.batch([
    db.prepare("DELETE FROM agent_connections WHERE user_email = ? AND client_id = ?").bind(userEmail, clientId),
    db
      .prepare(
        `INSERT INTO agent_connections (id, user_email, name, client_id, access_hash, access_expires_at, refresh_hash, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), userEmail, name, clientId, t.accessHash, t.accessExpiresAt, t.refreshHash, iso(now), iso(now)),
  ]);
  return t.tokens;
}

const isIdle = (lastUsedAt: string, now: number) => Date.parse(lastUsedAt) < now - AGENT_IDLE_TTL_MS;

async function deleteConnection(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM agent_connections WHERE id = ?").bind(id).run();
}

/**
 * リフレッシュトークンでトークンを入れ替える。1つ前のトークンが再び使われたら
 * 漏えいとみなして接続を消す。無効なら null。
 */
export async function refreshConnection(
  db: D1Database,
  refreshToken: string,
  clientId: string,
  now = Date.now(),
): Promise<OAuthTokens | null> {
  const hash = await sha256Hex(refreshToken);
  const row = await db
    .prepare(
      "SELECT id, client_id, refresh_hash, last_used_at FROM agent_connections WHERE refresh_hash = ? OR previous_refresh_hash = ?",
    )
    .bind(hash, hash)
    .first<{ id: string; client_id: string | null; refresh_hash: string; last_used_at: string }>();
  if (!row || row.client_id !== clientId) return null;
  if (row.refresh_hash !== hash || isIdle(row.last_used_at, now)) {
    await deleteConnection(db, row.id);
    return null;
  }
  const t = await newOAuthTokens(now);
  // D1には対話的なトランザクションが無いため、読んだ時点のリフレッシュトークンのままであることを
  // 条件に入れ替える。同時に2回使われた場合は片方だけが成功する。
  const result = await db
    .prepare(
      `UPDATE agent_connections
       SET access_hash = ?, access_expires_at = ?, refresh_hash = ?, previous_refresh_hash = ?, last_used_at = ?
       WHERE id = ? AND refresh_hash = ?`,
    )
    .bind(t.accessHash, t.accessExpiresAt, t.refreshHash, hash, iso(now), row.id, hash)
    .run();
  return result.meta.changes > 0 ? t.tokens : null;
}

export interface AgentContext {
  connectionId: string;
  /** 発行者のメールアドレス。操作先のカレンダーはここからアカウント連携で解決する */
  userEmail: string;
}

/**
 * Bearerトークン(手動発行・OAuthのアクセストークン)を確かめる。
 * 期限切れ・90日未使用なら null。使えたら最終使用日時を更新する。
 */
export async function authenticateAgent(
  db: D1Database,
  token: string,
  now = Date.now(),
): Promise<AgentContext | null> {
  const row = await db
    .prepare("SELECT id, user_email, access_expires_at, last_used_at FROM agent_connections WHERE access_hash = ?")
    .bind(await sha256Hex(token))
    .first<{ id: string; user_email: string; access_expires_at: string | null; last_used_at: string }>();
  if (!row) return null;
  if (isIdle(row.last_used_at, now)) {
    await deleteConnection(db, row.id);
    return null;
  }
  if (row.access_expires_at !== null && Date.parse(row.access_expires_at) <= now) return null;
  await db.prepare("UPDATE agent_connections SET last_used_at = ? WHERE id = ?").bind(iso(now), row.id).run();
  return { connectionId: row.id, userEmail: row.user_email };
}

export interface AgentConnectionSummary {
  id: string;
  userEmail: string;
  name: string;
  kind: "oauth" | "manual";
  /** 一覧での見分け方。手動発行・CIMDのドメイン・DCRの戻り先のドメイン */
  origin: string;
  createdAt: string;
  lastUsedAt: string;
}

function originOf(clientId: string | null, dcrRedirectUris: string | null): string {
  if (!clientId) return "手動発行";
  const url = dcrRedirectUris ? (JSON.parse(dcrRedirectUris) as string[])[0] : clientId;
  return URL.canParse(url) ? new URL(url).host + (dcrRedirectUris ? "(自己登録)" : "") : clientId;
}

/**
 * 接続一覧(新しい順)。userEmail を省くと全員分(管理者用)。
 * 90日使われていないものは失効しているので一覧に出さない(行はCronで消える)。
 */
export async function listAgentConnections(
  db: D1Database,
  userEmail: string | null,
  now = Date.now(),
): Promise<AgentConnectionSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.user_email, c.name, c.client_id, o.redirect_uris, c.created_at, c.last_used_at
       FROM agent_connections c LEFT JOIN oauth_clients o ON o.id = c.client_id
       WHERE ?1 IS NULL OR c.user_email = ?1
       ORDER BY c.created_at DESC`,
    )
    .bind(userEmail)
    .all<{
      id: string;
      user_email: string;
      name: string;
      client_id: string | null;
      redirect_uris: string | null;
      created_at: string;
      last_used_at: string;
    }>();
  return results
    .filter((r) => !isIdle(r.last_used_at, now))
    .map((r) => ({
      id: r.id,
      userEmail: r.user_email,
      name: r.name,
      kind: r.client_id ? "oauth" : "manual",
      origin: originOf(r.client_id, r.redirect_uris),
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    }));
}

/** 接続を取り消す。userEmail を省くと誰の接続でも消せる(管理者用)。見つからなければ false */
export async function revokeAgentConnection(db: D1Database, id: string, userEmail: string | null): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM agent_connections WHERE id = ?1 AND (?2 IS NULL OR user_email = ?2)")
    .bind(id, userEmail)
    .run();
  return result.meta.changes > 0;
}

/**
 * OAuthのトークン取り消し(RFC 7009)。アクセス・リフレッシュどちらでも接続ごと消す。
 * 別のクライアントのトークンや不明なトークンは何もしない(結果は常に成功扱い)。
 */
export async function revokeByToken(db: D1Database, token: string, clientId: string): Promise<void> {
  const hash = await sha256Hex(token);
  await db
    .prepare("DELETE FROM agent_connections WHERE client_id = ? AND (access_hash = ? OR refresh_hash = ?)")
    .bind(clientId, hash, hash)
    .run();
}
