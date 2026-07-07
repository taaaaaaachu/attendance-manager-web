import { env, fetchMock } from "cloudflare:test";

/**
 * Cloudflare Access認証のテストヘルパー。
 *
 * テスト用RSA鍵ペアを生成し、その公開鍵をAccessのJWKSエンドポイント
 * (https://<team>/cdn-cgi/access/certs)としてfetchMockで配信、秘密鍵で
 * Cf-Access-Jwt-Assertion用のJWTを署名する。これによりミドルウェアの
 * 署名検証を本物のフローと同じ経路でテストできる。
 */

const TEST_KID = "test-key-1";

let keyPairPromise: Promise<CryptoKeyPair> | null = null;

function getTestKeyPair(): Promise<CryptoKeyPair> {
  keyPairPromise ??= crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  ) as Promise<CryptoKeyPair>;
  return keyPairPromise;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeJsonSegment(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

export interface SignAccessJwtOptions {
  email?: string;
  aud?: string;
  iss?: string;
  /** 有効期限(現在からの秒数)。負値で期限切れトークンを作れる */
  expiresInSec?: number;
  kid?: string;
  /** 署名に使う鍵。省略時はテスト鍵(JWKSで配信される鍵)を使う */
  privateKey?: CryptoKey;
}

export async function signAccessJwt(options: SignAccessJwtOptions = {}): Promise<string> {
  const { privateKey } = await getTestKeyPair();
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: options.kid ?? TEST_KID, typ: "JWT" };
  const payload = {
    email: options.email ?? "test-user@example.com",
    aud: options.aud ?? env.ACCESS_AUD,
    iss: options.iss ?? `https://${env.ACCESS_TEAM_DOMAIN}`,
    iat: nowSec,
    exp: nowSec + (options.expiresInSec ?? 600),
  };
  const signingInput = `${encodeJsonSegment(header)}.${encodeJsonSegment(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    options.privateKey ?? privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** テスト鍵とは別の(JWKSに載っていない)鍵ペアを生成する。署名不一致のテスト用 */
export async function generateUntrustedKey(): Promise<CryptoKey> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  return pair.privateKey;
}

/** AccessのJWKSエンドポイントをfetchMockで配信する。各テストファイルのbeforeAllで呼ぶ */
export async function mockAccessCerts(): Promise<void> {
  const { publicKey } = await getTestKeyPair();
  const jwk = (await crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey & { kid?: string };
  jwk.kid = TEST_KID;

  fetchMock.activate();
  fetchMock.disableNetConnect();
  fetchMock
    .get(`https://${env.ACCESS_TEAM_DOMAIN}`)
    .intercept({ path: "/cdn-cgi/access/certs" })
    .reply(200, { keys: [jwk] })
    .persist();
}

/** 指定メールアドレスで認証済みのリクエストヘッダを作る */
export async function authHeaders(
  email: string,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  return { "Cf-Access-Jwt-Assertion": await signAccessJwt({ email }), ...extra };
}
