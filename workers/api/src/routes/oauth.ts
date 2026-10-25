import { Hono } from "hono";
import { html } from "hono/html";
import {
  createOAuthConnection,
  normalizeAgentName,
  refreshConnection,
  revokeByToken,
  type OAuthTokens,
} from "../lib/agentConnections";
import {
  consumeAuthorizationCode,
  isRegisteredRedirectUri,
  issueAuthorizationCode,
  parseAuthorizeRequest,
  redirectWith,
  registerClient,
  resolveClient,
  validateRegistration,
  type AuthorizeRequest,
  type ClientMetadata,
} from "../lib/oauth";
import { requireAccessAuth } from "../middleware/accessAuth";
import type { AppEnv } from "../types";

/**
 * 自前のOAuth 2.1認可サーバーのエンドポイント(ADR 0004)。
 *
 * /oauth/authorize(同意画面)だけはCloudflare Accessの内側に残し、Access JWTの身元で
 * 「誰が許可したか」を決める。/oauth/token・/oauth/register・/oauth/revoke はエージェントの
 * サーバーからOriginもAccessのCookieもなしに呼ばれるため、AccessをBypassし、
 * requireAccessAuth も通さない(認可コード+PKCE・リフレッシュトークンだけで認証する)。
 */

export const issuerOf = (url: string) => new URL(url).origin;
export const mcpResourceOf = (url: string) => `${issuerOf(url)}/mcp`;

const cors = { "Access-Control-Allow-Origin": "*" };
const noStore = { "Cache-Control": "no-store" };

const oauth = new Hono<AppEnv>();

// --- 同意画面 ---

type Checked = { error: string } | { redirect: string } | { request: AuthorizeRequest; client: ClientMetadata };

/**
 * 認可リクエストを確かめる。戻り先が確かめられないうちの誤りは画面に出し、
 * 確かめた後の誤りは error パラメーター付きで戻り先へ返す(OAuth 2.1)。
 */
async function check(db: D1Database, url: string): Promise<Checked> {
  const params = new URL(url).searchParams;
  const parsed = parseAuthorizeRequest(params, mcpResourceOf(url));
  if ("fatal" in parsed) return { error: parsed.fatal };
  const client = await resolveClient(db, params.get("client_id") ?? "");
  if (typeof client === "string") return { error: client };
  const redirectUri = "ok" in parsed ? parsed.ok.redirectUri : parsed.request.redirectUri;
  if (!isRegisteredRedirectUri(client.redirectUris, redirectUri)) {
    return { error: "戻り先(redirect_uri)がクライアントの情報に登録されていません。" };
  }
  if ("redirectError" in parsed) {
    const { redirectError, description, request } = parsed;
    return {
      redirect: redirectWith(
        request.redirectUri,
        { error: redirectError, error_description: description, state: request.state },
        issuerOf(url),
      ),
    };
  }
  return { request: parsed.ok, client };
}

function page(title: string, body: unknown) {
  return html`<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title} - 出社・在宅管理</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #f5f6f8; color: #1f2937; margin: 0; padding: 16px; }
          main { max-width: 480px; margin: 40px auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 4px rgb(0 0 0 / 0.08); }
          h1 { font-size: 1.25rem; margin-top: 0; }
          .error { color: #b91c1c; background: #fef2f2; padding: 12px; border-radius: 8px; }
          dt { font-weight: 600; margin-top: 12px; }
          dd { margin: 4px 0 0; word-break: break-all; }
          label { display: block; margin-top: 16px; font-weight: 600; }
          input { width: 100%; box-sizing: border-box; padding: 8px; margin-top: 4px; font-size: 1rem; }
          .actions { display: flex; gap: 12px; margin-top: 24px; }
          button { flex: 1; padding: 10px; font-size: 1rem; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; }
          button[value="allow"] { background: #2563eb; border-color: #2563eb; color: #fff; }
        </style>
      </head>
      <body>
        <main>${body}</main>
      </body>
    </html>`;
}

function errorPage(message: string) {
  return page("接続できません", html`<h1>接続できません</h1><p class="error">${message}</p>`);
}

// 同意画面を他サイトに埋め込ませない(クリックジャッキング対策)
oauth.use("/authorize", async (c, next) => {
  await next();
  c.header("X-Frame-Options", "DENY");
  c.header("Content-Security-Policy", "frame-ancestors 'none'");
  c.header("Cache-Control", "no-store");
});
oauth.use("/authorize", requireAccessAuth);

oauth.get("/authorize", async (c) => {
  const checked = await check(c.env.DB, c.req.url);
  if ("error" in checked) return c.html(errorPage(checked.error), 400);
  if ("redirect" in checked) return c.redirect(checked.redirect, 303);
  const { client, request } = checked;
  // DCRのclient_idはドメインを持たないので、身元として出せるのは戻り先のドメインだけ
  const host = new URL(client.kind === "cimd" ? client.clientId : request.redirectUri).host;
  return c.html(
    page(
      "エージェント接続の許可",
      html`<h1>エージェント接続の許可</h1>
        <p>次のAIエージェントが、あなたの代わりに勤怠を操作できるようになります。</p>
        <dl>
          <dt>接続元</dt>
          <dd>${host}${client.kind === "dcr" ? "(自己登録・名前は自己申告)" : ""}</dd>
          ${client.clientName ? html`<dt>名前</dt><dd>${client.clientName}</dd>` : ""}
          <dt>戻り先</dt>
          <dd>${new URL(request.redirectUri).host}</dd>
          <dt>許可するアカウント</dt>
          <dd>${c.get("userId")}</dd>
          <dt>できること</dt>
          <dd>
            勤怠の閲覧・記録・削除、出社率の確認、設定の変更、会社の休日・出勤日の登録、スケジュールの一括適用。
            アカウント連携の操作、管理者機能、全件リセットはできません。
          </dd>
        </dl>
        <form method="post">
          <label>
            この接続の名前(一覧での表示用)
            <input name="name" maxlength="50" value="${client.clientName ?? host}" />
          </label>
          <div class="actions">
            <button type="submit" name="decision" value="deny">拒否</button>
            <button type="submit" name="decision" value="allow">許可</button>
          </div>
        </form>`,
    ),
  );
});

oauth.post("/authorize", async (c) => {
  // AccessのCookieは他サイトからのPOSTにも付きうるため、同じオリジンからの送信だけを受け付ける(CSRF対策)
  if (c.req.header("Origin") !== issuerOf(c.req.url)) {
    return c.html(errorPage("不正な送信元です。もう一度接続をやり直してください。"), 403);
  }
  const checked = await check(c.env.DB, c.req.url);
  if ("error" in checked) return c.html(errorPage(checked.error), 400);
  if ("redirect" in checked) return c.redirect(checked.redirect, 303);
  const { client, request } = checked;
  const form = await c.req.parseBody();
  if (form.decision !== "allow") {
    return c.redirect(
      redirectWith(request.redirectUri, { error: "access_denied", state: request.state }, issuerOf(c.req.url)),
      303,
    );
  }
  const name =
    normalizeAgentName(form.name) ??
    normalizeAgentName(client.clientName) ??
    new URL(client.kind === "cimd" ? client.clientId : request.redirectUri).host;
  const code = await issueAuthorizationCode(c.env.DB, {
    clientId: client.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    userEmail: c.get("userId"),
    name,
  });
  return c.redirect(redirectWith(request.redirectUri, { code, state: request.state }, issuerOf(c.req.url)), 303);
});

// --- トークン ---

function oauthError(error: string, description: string, status: 400 | 429 = 400): Response {
  return Response.json({ error, error_description: description }, { status, headers: { ...cors, ...noStore } });
}

function tokenResponse(t: OAuthTokens): Response {
  return Response.json(
    { access_token: t.accessToken, token_type: "Bearer", expires_in: t.expiresIn, refresh_token: t.refreshToken },
    { headers: { ...cors, ...noStore } },
  );
}

/** フォームの文字列項目。空・ファイルは null */
async function formOf(req: Request): Promise<(key: string) => string | null> {
  const form = await req.formData().catch(() => null);
  return (key) => {
    const v = form?.get(key);
    return typeof v === "string" && v !== "" ? v : null;
  };
}

oauth.post("/token", async (c) => {
  const get = await formOf(c.req.raw);
  const clientId = get("client_id");
  if (!clientId) return oauthError("invalid_request", "client_id がありません。");

  switch (get("grant_type")) {
    case "authorization_code": {
      const code = get("code");
      const redirectUri = get("redirect_uri");
      const codeVerifier = get("code_verifier");
      if (!code || !redirectUri || !codeVerifier) {
        return oauthError("invalid_request", "code・redirect_uri・code_verifier が必要です。");
      }
      const grant = await consumeAuthorizationCode(c.env.DB, code, { clientId, redirectUri, codeVerifier });
      if (!grant) return oauthError("invalid_grant", "認可コードが無効です(期限切れ・使用済み・不一致)。");
      return tokenResponse(await createOAuthConnection(c.env.DB, grant.userEmail, clientId, grant.name));
    }
    case "refresh_token": {
      const refreshToken = get("refresh_token");
      if (!refreshToken) return oauthError("invalid_request", "refresh_token がありません。");
      const tokens = await refreshConnection(c.env.DB, refreshToken, clientId);
      return tokens
        ? tokenResponse(tokens)
        : oauthError("invalid_grant", "リフレッシュトークンが無効です。接続し直してください。");
    }
    default:
      return oauthError("unsupported_grant_type", "authorization_code と refresh_token だけに対応しています。");
  }
});

// --- 取り消し(RFC 7009) ---

oauth.post("/revoke", async (c) => {
  const get = await formOf(c.req.raw);
  const token = get("token");
  const clientId = get("client_id");
  if (!token || !clientId) return oauthError("invalid_request", "token と client_id が必要です。");
  await revokeByToken(c.env.DB, token, clientId);
  // 不明なトークンでも200を返す(RFC 7009)
  return new Response(null, { status: 200, headers: cors });
});

// --- Dynamic Client Registration(RFC 7591) ---

oauth.options(
  "/register",
  () =>
    new Response(null, {
      status: 204,
      headers: { ...cors, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type" },
    }),
);

/** 誰でも登録できるが、使えるのは本人が同意画面で許可した後だけ */
oauth.post("/register", async (c) => {
  const { success } = await c.env.REGISTER_RATE_LIMITER.limit({ key: c.req.header("CF-Connecting-IP") ?? "unknown" });
  if (!success) return oauthError("too_many_requests", "登録が多すぎます。しばらく待ってから試してください。", 429);
  const input = validateRegistration(await c.req.json().catch(() => null));
  if ("error" in input) return oauthError(input.error, input.description);
  const client = await registerClient(c.env.DB, input);
  if (!client) return oauthError("too_many_requests", "現在新しい登録を受け付けていません。", 429);
  return Response.json(
    {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers: { ...cors, ...noStore } },
  );
});

export { oauth as oauthRoutes };

// --- メタデータ ---

export const wellKnownRoutes = new Hono<AppEnv>();

/** 認可サーバーのメタデータ(RFC 8414)。クライアント登録はCIMDとDCR */
wellKnownRoutes.get("/oauth-authorization-server", (c) => {
  const issuer = issuerOf(c.req.url);
  return c.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      registration_endpoint: `${issuer}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    },
    200,
    cors,
  );
});

/**
 * 保護リソースのメタデータ(RFC 9728)。resource は /mcp なので本来の在処は
 * /.well-known/oauth-protected-resource/mcp だが、末尾なしで探すクライアントにも同じものを返す。
 */
wellKnownRoutes.on("GET", ["/oauth-protected-resource", "/oauth-protected-resource/mcp"], (c) =>
  c.json(
    {
      resource: mcpResourceOf(c.req.url),
      authorization_servers: [issuerOf(c.req.url)],
      bearer_methods_supported: ["header"],
      resource_name: "出社・在宅管理",
    },
    200,
    cors,
  ),
);
