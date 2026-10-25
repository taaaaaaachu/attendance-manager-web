import { AGENT_IDLE_TTL_MS, base64UrlEncode, randomToken, sha256Hex } from "./agentConnections";

/**
 * 自前のOAuth 2.1認可サーバー(ADR 0004)。クライアントはClient ID Metadata Document(CIMD)か
 * Dynamic Client Registration(DCR)で受け付け、どちらも公開クライアント(PKCE S256、クライアント認証なし)として扱う。
 * Workersのisolateはリクエストをまたいで共有される保証がないため、状態はすべてD1に置く。
 */

const iso = (ms: number) => new Date(ms).toISOString();

// --- クライアント(CIMD) ---

export interface ClientMetadata {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
  /** cimd: client_id のURLのドメインが身元。dcr: 自己申告だけで、身元は戻り先のドメインしかない */
  kind: "cimd" | "dcr";
}

/**
 * client_id として受け付けるURLか。https でパスを持ち、資格情報・フラグメント・ドットセグメントを含まない。
 * SSRF対策として、IPアドレス直書き・ドットの無いホスト名・既定以外のポートも拒む。
 */
export function parseClientIdUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || value.includes("#")) return null;
  if (url.pathname === "/" || /\/\.\.?(\/|$)/.test(value.slice(url.origin.length))) return null;
  if (url.port || !url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname) || url.hostname.startsWith("[")) {
    return null;
  }
  return url.href === value ? url : null;
}

/** 取得した文書を検証する。仕様に合わなければ理由を返す */
export function validateClientMetadata(clientId: string, doc: unknown): ClientMetadata | string {
  if (typeof doc !== "object" || doc === null) return "クライアントの情報が JSON オブジェクトではありません。";
  const d = doc as Record<string, unknown>;
  if (d.client_id !== clientId) return "クライアントの情報の client_id が URL と一致しません。";
  const uris = d.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every((u) => typeof u === "string" && URL.canParse(u))) {
    return "クライアントの情報に redirect_uris がありません。";
  }
  const method = d.token_endpoint_auth_method;
  if (method !== undefined && method !== "none") {
    return "公開クライアント(token_endpoint_auth_method: none)だけに対応しています。";
  }
  return { clientId, clientName: cleanName(d.client_name), redirectUris: uris as string[], kind: "cimd" };
}

function cleanName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 100) : null;
}

/**
 * 戻り先が登録済みのものと一致するか。完全一致だけを認める。ただしループバック(http の
 * 127.0.0.1・[::1]・localhost)は、ポートだけ違ってよい(RFC 8252)。
 */
export function isRegisteredRedirectUri(registered: string[], redirectUri: string): boolean {
  if (registered.includes(redirectUri)) return true;
  if (!URL.canParse(redirectUri)) return false;
  const target = new URL(redirectUri);
  if (!isLoopback(target)) return false;
  return registered.some((r) => {
    const u = URL.canParse(r) ? new URL(r) : null;
    return (
      u !== null &&
      isLoopback(u) &&
      u.hostname === target.hostname &&
      u.pathname === target.pathname &&
      u.search === target.search
    );
  });
}

function isLoopback(u: URL): boolean {
  return u.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(u.hostname);
}

const FETCH_TIMEOUT_MS = 5000;
const FETCH_MAX_BYTES = 10 * 1024;

export type FetchJson = (url: URL) => Promise<unknown>;

/**
 * CIMDの文書を取りに行く。Workersでは送信先のIPを確かめられないので、
 * 1) wrangler.jsonc の global_fetch_strictly_public で、同じゾーンや非公開の宛先へ抜けないようにし、
 * 2) リダイレクトは追わず(redirect: 'manual')、3) 時間と大きさに上限を設ける。
 */
export const fetchClientMetadata: FetchJson = async (url) => {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status !== 200 || !res.body) {
    await res.body?.cancel();
    throw new Error(`HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > FETCH_MAX_BYTES) {
      await reader.cancel();
      throw new Error("大きすぎます");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("JSON ではありません");
  }
};

/**
 * クライアントの情報を得る。DCRで登録した client_id ならD1から、それ以外はCIMDとして取得して検証する。
 * 失敗なら理由の文字列。
 */
// ponytail: CIMDの文書はキャッシュせず毎回取得する(同意画面の表示と許可の2回)。利用が増えたらD1かCache APIに置く
export async function resolveClient(
  db: D1Database,
  clientId: string,
  fetchJson: FetchJson = fetchClientMetadata,
): Promise<ClientMetadata | string> {
  if (clientId.startsWith(DCR_PREFIX)) {
    return (await findRegisteredClient(db, clientId)) ?? "登録されていないクライアントです。登録し直してください。";
  }
  const url = parseClientIdUrl(clientId);
  if (!url) return "client_id は https の URL(パス付き)で指定してください。";
  let doc: unknown;
  try {
    doc = await fetchJson(url);
  } catch (e) {
    return `クライアントの情報を取得できませんでした(${e instanceof Error ? e.message : "不明なエラー"})。`;
  }
  return validateClientMetadata(clientId, doc);
}

// --- クライアント(DCR) ---

const DCR_PREFIX = "dcr_";
const MAX_REDIRECT_URIS = 10;
/** 接続に一度も使われないまま、この期間を過ぎた登録は消す */
export const UNUSED_CLIENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** 接続に使われていない登録がこの件数に達したら、新しい登録を断る(D1の無料枠を食い潰させない) */
export const MAX_UNUSED_CLIENTS = 1000;

/**
 * 登録リクエスト(RFC 7591)を検証する。戻り先は https か、ループバックの http だけ。
 * 認証方式は何を求められても none(公開クライアント)で登録する(RFC 7591 はサーバーが値を置き換えることを認めている)。
 */
export function validateRegistration(
  body: unknown,
): { clientName: string | null; redirectUris: string[] } | { error: string; description: string } {
  const bad = (error: string, description: string) => ({ error, description });
  if (typeof body !== "object" || body === null) return bad("invalid_client_metadata", "JSON オブジェクトで送ってください。");
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
    return bad("invalid_redirect_uri", `redirect_uris は1〜${MAX_REDIRECT_URIS}件で指定してください。`);
  }
  for (const u of uris) {
    if (typeof u !== "string" || u.length > 2048 || !URL.canParse(u) || u.includes("#")) {
      return bad("invalid_redirect_uri", "redirect_uris に不正な URL があります。");
    }
    const url = new URL(u);
    if (url.protocol !== "https:" && !isLoopback(url)) {
      return bad("invalid_redirect_uri", "redirect_uris は https か、ループバックの http だけです。");
    }
  }
  const grants = b.grant_types;
  if (
    grants !== undefined &&
    (!Array.isArray(grants) ||
      !grants.includes("authorization_code") ||
      grants.some((g) => g !== "authorization_code" && g !== "refresh_token"))
  ) {
    return bad("invalid_client_metadata", "grant_types は authorization_code と refresh_token だけです。");
  }
  const responses = b.response_types;
  if (responses !== undefined && (!Array.isArray(responses) || responses.some((r) => r !== "code"))) {
    return bad("invalid_client_metadata", "response_types は code だけです。");
  }
  return { clientName: cleanName(b.client_name), redirectUris: uris as string[] };
}

const UNUSED_CLIENTS = "oauth_clients WHERE id NOT IN (SELECT client_id FROM agent_connections WHERE client_id IS NOT NULL)";

/** クライアントを登録する。未使用の登録が上限に達していたら null */
export async function registerClient(
  db: D1Database,
  input: { clientName: string | null; redirectUris: string[] },
  now = Date.now(),
): Promise<ClientMetadata | null> {
  const unused = await db.prepare(`SELECT COUNT(*) AS n FROM ${UNUSED_CLIENTS}`).first<{ n: number }>();
  if ((unused?.n ?? 0) >= MAX_UNUSED_CLIENTS) return null;
  const clientId = DCR_PREFIX + base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
  await db
    .prepare("INSERT INTO oauth_clients (id, client_name, redirect_uris, created_at) VALUES (?, ?, ?, ?)")
    .bind(clientId, input.clientName, JSON.stringify(input.redirectUris), iso(now))
    .run();
  return { clientId, clientName: input.clientName, redirectUris: input.redirectUris, kind: "dcr" };
}

export async function findRegisteredClient(db: D1Database, clientId: string): Promise<ClientMetadata | null> {
  const row = await db
    .prepare("SELECT id, client_name, redirect_uris FROM oauth_clients WHERE id = ?")
    .bind(clientId)
    .first<{ id: string; client_name: string | null; redirect_uris: string }>();
  return row
    ? { clientId: row.id, clientName: row.client_name, redirectUris: JSON.parse(row.redirect_uris), kind: "dcr" }
    : null;
}

// --- 認可コード ---

const CODE_TTL_MS = 60 * 1000;

export interface Grant {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userEmail: string;
  name: string;
}

export async function issueAuthorizationCode(db: D1Database, grant: Grant, now = Date.now()): Promise<string> {
  const code = randomToken();
  await db
    .prepare(
      `INSERT INTO oauth_codes (code_hash, client_id, redirect_uri, code_challenge, user_email, name, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      await sha256Hex(code),
      grant.clientId,
      grant.redirectUri,
      grant.codeChallenge,
      grant.userEmail,
      grant.name,
      iso(now + CODE_TTL_MS),
    )
    .run();
  return code;
}

/** PKCE S256 の検証 */
export async function verifyPkce(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const expected = new TextEncoder().encode(base64UrlEncode(new Uint8Array(digest)));
  const actual = new TextEncoder().encode(codeChallenge);
  return expected.byteLength === actual.byteLength && crypto.subtle.timingSafeEqual(expected, actual);
}

/**
 * 認可コードを使う。1回きりで、クライアント・戻り先・PKCEが発行時と一致したときだけ許可内容を返す。
 * 失敗しても使ったコードは消す(DELETE ... RETURNING で取り出すので、同時に使っても成功は1回だけ)。
 */
export async function consumeAuthorizationCode(
  db: D1Database,
  code: string,
  check: { clientId: string; redirectUri: string; codeVerifier: string },
  now = Date.now(),
): Promise<Grant | null> {
  const row = await db
    .prepare("DELETE FROM oauth_codes WHERE code_hash = ? RETURNING *")
    .bind(await sha256Hex(code))
    .first<{
      client_id: string;
      redirect_uri: string;
      code_challenge: string;
      user_email: string;
      name: string;
      expires_at: string;
    }>();
  if (!row || Date.parse(row.expires_at) <= now) return null;
  if (row.client_id !== check.clientId || row.redirect_uri !== check.redirectUri) return null;
  if (!(await verifyPkce(check.codeVerifier, row.code_challenge))) return null;
  return {
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    userEmail: row.user_email,
    name: row.name,
  };
}

// --- 認可リクエスト ---

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
}

/**
 * 認可リクエストのうち、戻り先を確かめる前に分かる誤り(戻り先へ返せない)と、
 * 確かめた後の誤り(error パラメーター付きで戻り先へ返す)を分けて検証する。
 * resource(RFC 8707)は指定があれば MCP エンドポイントと一致しなければならない。
 */
export function parseAuthorizeRequest(
  params: URLSearchParams,
  resource: string,
):
  | { ok: AuthorizeRequest }
  | { fatal: string }
  | { redirectError: string; description: string; request: Pick<AuthorizeRequest, "redirectUri" | "state"> } {
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  if (!clientId) return { fatal: "client_id がありません。" };
  if (!redirectUri) return { fatal: "redirect_uri がありません。" };
  const state = params.get("state");
  const fail = (redirectError: string, description: string) => ({
    redirectError,
    description,
    request: { redirectUri, state },
  });
  if (params.get("response_type") !== "code") {
    return fail("unsupported_response_type", "response_type は code だけに対応しています。");
  }
  const codeChallenge = params.get("code_challenge");
  if (!codeChallenge || !/^[A-Za-z0-9\-_]{43}$/.test(codeChallenge)) {
    return fail("invalid_request", "code_challenge(PKCE)が必要です。");
  }
  if (params.get("code_challenge_method") !== "S256") {
    return fail("invalid_request", "code_challenge_method は S256 だけに対応しています。");
  }
  if (params.getAll("resource").some((r) => r.replace(/\/$/, "") !== resource)) {
    return fail("invalid_target", `resource は ${resource} だけです。`);
  }
  return { ok: { clientId, redirectUri, codeChallenge, state } };
}

/** 戻り先へのリダイレクトURL(RFC 9207 の iss を付ける) */
export function redirectWith(redirectUri: string, params: Record<string, string | null>, issuer: string): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries({ ...params, iss: issuer })) {
    if (v !== null) url.searchParams.set(k, v);
  }
  return url.href;
}

// --- 掃除 ---

/**
 * 期限切れの認可コード・90日使われていない接続・使われないまま30日過ぎたDCRの登録を消す。
 * 利用時にも期限は確かめているので、これは残った行の掃除だけ(Cron Triggerから日次で呼ぶ)。
 */
export async function purgeExpiredOAuthData(db: D1Database, now = Date.now()): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM oauth_codes WHERE expires_at <= ?").bind(iso(now)),
    db.prepare("DELETE FROM agent_connections WHERE last_used_at < ?").bind(iso(now - AGENT_IDLE_TTL_MS)),
    db.prepare(`DELETE FROM ${UNUSED_CLIENTS} AND created_at < ?`).bind(iso(now - UNUSED_CLIENT_TTL_MS)),
  ]);
}
