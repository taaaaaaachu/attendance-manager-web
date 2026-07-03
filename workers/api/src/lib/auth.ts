const SALT_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;
const PBKDF2_HASH = "SHA-256";
const DERIVED_KEY_BITS = 256;

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

export function saltToBase64(salt: Uint8Array): string {
  return bufferToBase64(salt.buffer as ArrayBuffer);
}

export function saltFromBase64(base64: string): Uint8Array {
  return base64ToBuffer(base64);
}

/**
 * PBKDF2-HMAC-SHA256でパスワードをハッシュ化する。
 * 反復回数はCloudflare Workers Freeプランのリクエストあたり10ms CPU時間制限に収まるよう調整すること
 * (README参照)。
 */
export async function hashPassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: PBKDF2_HASH },
    keyMaterial,
    DERIVED_KEY_BITS,
  );
  return bufferToBase64(bits);
}

export async function verifyPassword(
  password: string,
  storedHashBase64: string,
  saltBase64: string,
  iterations: number,
): Promise<boolean> {
  const salt = saltFromBase64(saltBase64);
  const computed = await hashPassword(password, salt, iterations);
  return constantTimeEqual(computed, storedHashBase64);
}

/** タイミング攻撃対策のための定数時間文字列比較 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** ランダムなセッショントークン(生の値。Cookie/Authorizationヘッダーに渡す) */
export function generateSessionToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES)));
}

/** セッショントークンをDBに保存する際のハッシュ(生トークンはDBに保存しない) */
export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bufferToHex(digest);
}
