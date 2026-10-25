-- エージェント接続(MCPでAIエージェントに操作させるための許可)と、自前のOAuth 2.1認可サーバーの状態。
-- 詳細は docs/adr/0004-agent-connections-and-own-oauth-server.md。日時はすべてISO8601のTEXT。
-- トークン・認可コードは平文で持たず、SHA-256のハッシュ(hex)だけを保存する。

-- 1行=1接続。発行者(user_email)に結びつき、操作先のカレンダーは操作のたびにアカウント連携で解決する。
-- client_idがNULLなら手動発行(期限なしのBearerトークン)、それ以外はOAuthの同意で作った接続。
CREATE TABLE agent_connections (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  client_id TEXT,
  access_hash TEXT NOT NULL UNIQUE,
  -- NULL = 期限なし(手動発行)
  access_expires_at TEXT,
  refresh_hash TEXT UNIQUE,
  -- 1つ前のリフレッシュトークン。再び使われたら漏えいとみなして接続ごと消す
  previous_refresh_hash TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
CREATE INDEX idx_agent_connections_user ON agent_connections(user_email);
CREATE INDEX idx_agent_connections_previous_refresh ON agent_connections(previous_refresh_hash);

-- Dynamic Client Registration(RFC 7591)で登録されたクライアント。すべて公開クライアント。
-- CIMDのクライアントはURLそのものがclient_idなのでここには入らない。
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  client_name TEXT,
  -- 登録された戻り先(JSON配列)
  redirect_uris TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 発行済みで未使用の認可コード(寿命60秒・1回限り)。isolateをまたいで引けるようD1に置く。
CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
