import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

/**
 * Cloudflare Access認証。
 *
 * Accessを通過したリクエストにはAccessが署名したJWTがCf-Access-Jwt-Assertionヘッダで
 * 付与される。これをチームドメインの公開鍵で検証し、emailクレームをユーザーIDとして使う。
 * Access層がホスト名全体を保護しているが、workers.dev等の迂回経路や設定ミスに備えて
 * ヘッダを鵜呑みにせず署名・aud・issuer・有効期限を必ず検証する。
 */

export interface AccessJwtPayload {
  aud?: string | string[];
  email?: string;
  exp?: number;
  nbf?: number;
  iss?: string;
}

type AccessJwk = JsonWebKey & { kid?: string };

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
// 公開鍵はチーム単位でほぼ不変のため、Workerインスタンス内でキャッシュして
// リクエスト毎のfetchを避ける(鍵ローテーション追従のためTTL付き)
let jwksCache: { keys: AccessJwk[]; fetchedAt: number } | null = null;

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJsonSegment<T>(segment: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as T;
  } catch {
    return null;
  }
}

export async function fetchAccessPublicKeys(teamDomain: string): Promise<AccessJwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) {
    throw new Error(`Accessの公開鍵取得に失敗しました(status=${res.status})`);
  }
  const body = (await res.json()) as { keys?: AccessJwk[] };
  if (!body.keys?.length) {
    throw new Error("Accessの公開鍵レスポンスにkeysがありません");
  }
  jwksCache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

/** テスト用: 公開鍵キャッシュを破棄する */
export function clearAccessPublicKeyCache(): void {
  jwksCache = null;
}

/**
 * AccessのJWTを検証し、有効ならペイロードを返す。無効ならnull。
 * 署名(RS256)・kid・aud・issuer・exp/nbfをすべて検証する。
 */
export async function verifyAccessJwt(
  token: string,
  keys: AccessJwk[],
  expected: { aud: string; iss: string },
): Promise<AccessJwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const header = decodeJsonSegment<{ alg?: string; kid?: string }>(parts[0]);
  const payload = decodeJsonSegment<AccessJwtPayload>(parts[1]);
  if (!header || !payload || header.alg !== "RS256") return null;

  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let valid: boolean;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlDecode(parts[2]) as BufferSource,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const clockSkewSec = 60;
  if (typeof payload.exp !== "number" || payload.exp < nowSec - clockSkewSec) return null;
  if (typeof payload.nbf === "number" && payload.nbf > nowSec + clockSkewSec) return null;
  if (payload.iss !== expected.iss) return null;

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(expected.aud)) return null;

  return payload;
}

export const requireAccessAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header("Cf-Access-Jwt-Assertion");

  if (!token) {
    // ローカル開発(wrangler dev)にはAccess層がないため、.dev.varsのDEV_USER_EMAILで
    // 固定ユーザーとして動かす。本番ではこの変数を設定しないこと。
    if (c.env.DEV_USER_EMAIL) {
      c.set("userId", c.env.DEV_USER_EMAIL.toLowerCase());
      await next();
      return;
    }
    return c.json({ error: "認証が必要です" }, 401);
  }

  let keys: AccessJwk[];
  try {
    keys = await fetchAccessPublicKeys(c.env.ACCESS_TEAM_DOMAIN);
  } catch {
    return c.json({ error: "認証情報を検証できませんでした" }, 503);
  }

  const payload = await verifyAccessJwt(token, keys, {
    aud: c.env.ACCESS_AUD,
    iss: `https://${c.env.ACCESS_TEAM_DOMAIN}`,
  });
  if (!payload?.email) {
    return c.json({ error: "認証情報が無効です" }, 401);
  }

  c.set("userId", payload.email.toLowerCase());
  await next();
});
