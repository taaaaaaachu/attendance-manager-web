# Attendance Manager Web版

出社・在宅管理アプリのWeb版。attendance-manager(Tauriデスクトップアプリ)とは
**完全に独立した別プロダクト**として、Cloudflare Workers上で動作する。デスクトップ版とのデータ連携は行わない。

## 主な機能

- 日ごとの出社・在宅の記録と、締め日ベースの期間ごとの出社率の集計
- 必須出社日のルールや目標出社率の設定、会社の休日・出勤日の登録
- 日本の祝日の自動取得(内閣府の公開CSVを実行時に取得)
- 勤怠データのJSONエクスポート
- 複数のメールアドレスを1つのカレンダーに束ねるアカウント連携
- 管理者向けの全ユーザーの出社率一覧・閲覧・ユーザー削除(`/admin`)
- AIエージェントからの操作(MCP、`/mcp`。OAuth 2.1と手動発行のBearerトークンに対応)
- PWA対応(スマートフォンのホーム画面に追加して使える)

用語の定義は [CONTEXT.md](CONTEXT.md)、設計判断は [docs/adr/](docs/adr/) を参照。

## 技術スタック

- **Cloudflare Workers**: 単一WorkerでAPI(Hono)とフロントエンド静的アセットを両方配信
- **Cloudflare Access**: 認証層。Accessで認証されたメールアドレスがそのままアプリのユーザーIDになる
- **Cloudflare D1**: データストア(全テーブルのER図は [docs/db-schema.md](docs/db-schema.md) を参照)
- **React 19 + Vite**: フロントエンド(`apps/web`)
- **TypeScript**: 期間計算・営業日判定・統計計算ロジック(`packages/shared`)、デスクトップ版のRust実装を参照して独自に実装

pnpm workspaceによるモノレポ構成。

```
attendance-manager-web/
├── packages/shared/   # 期間計算・統計計算などの純粋ロジック(vitestでテスト)
├── apps/web/          # フロントエンド(React + Vite)
└── workers/api/       # Cloudflare Worker本体(Hono + D1)
```

## 前提条件

[mise](https://mise.jdx.dev/) でNode.js/pnpmを管理する。

```bash
mise install
pnpm install
```

## ローカル開発

1. D1のローカルマイグレーションを適用(初回のみ)と、ローカル用の認証バイパス設定:

   ```bash
   cd workers/api
   pnpm db:migrate:local
   cp .dev.vars.example .dev.vars
   ```

   ローカルにはCloudflare Access層がないため、`.dev.vars` の `DEV_USER_EMAIL` で
   固定ユーザーとして動作する(本番ではこの変数を設定しないこと)。
   `ADMIN_EMAILS` に同じアドレスを書くと、ローカルで管理者機能も使える。

2. フロントエンドをビルドしてWorker側のassetsディレクトリに出力:

   ```bash
   cd apps/web
   pnpm build
   ```

3. Workerを起動(APIと静的アセットの両方をこのポートで配信):

   ```bash
   cd workers/api
   pnpm dev
   ```

   `http://127.0.0.1:8787` でアプリ全体にアクセスできる。

フロントエンドのみをHMR付きで素早く開発したい場合は `apps/web` で `pnpm dev`(Vite、ポート5173)を使う。
`vite.config.ts` で `/api/*` を `http://127.0.0.1:8787` にプロキシしているため、`workers/api` 側の
`pnpm dev` を別ターミナルで併走させておくこと。

## テスト

```bash
# packages/shared のロジックテスト
cd packages/shared && pnpm test

# apps/web のコンポーネントテスト
cd apps/web && pnpm test

# workers/api の統合テスト(@cloudflare/vitest-plugin、実際のWorkersランタイム上で実行)
# wrangler.jsoncのassets.directoryが実在する必要があるため、先にapps/webをビルドしておく
cd workers/api && pnpm test
```

各パッケージで `pnpm typecheck` を実行すると型チェックができる。

## デプロイ(初回)

このプロジェクトは **Cloudflare Free プラン(完全無料)で運用できる**ことを前提に設計している
(Workers: 100,000リクエスト/日、D1: 5GBストレージ・500万行読み取り/日・10万行書き込み/日、いずれもクレジットカード登録不要)。

1. Cloudflareアカウントにログイン:

   ```bash
   cd workers/api
   npx wrangler login
   ```

2. リモートD1データベースを作成:

   ```bash
   npx wrangler d1 create attendance-manager-db
   ```

   出力される `database_id` を `workers/api/wrangler.jsonc` の `d1_databases[0].database_id` に反映する。

3. リモートDBにマイグレーションを適用:

   ```bash
   pnpm db:migrate:remote
   ```

4. Cloudflare Accessでアプリを保護し、AUDタグを `wrangler.jsonc` の `ACCESS_AUD` に設定する
   (後述の「認証(Cloudflare Access)」参照)。

5. 管理者のメールアドレスをsecretとして登録する(後述の「管理者機能」参照):

   ```bash
   npx wrangler secret put ADMIN_EMAILS
   ```

6. フロントエンドをビルドしてデプロイ:

   ```bash
   cd apps/web && pnpm build
   cd ../../workers/api && pnpm deploy
   ```

   `wrangler.jsonc` の `routes` の `pattern` と `ACCESS_TEAM_DOMAIN` はプレースホルダー(`example.com` 等)。
   手元からデプロイする場合は、これらを自分の値に書き換えてから実行すること。

## CI/CD(GitHub Actions)

`.github/workflows/ci.yml` が、すべてのpush/PRで各パッケージの型チェック・テスト・ビルドを行い、
mainへのpushではテスト成功後に本番D1へのマイグレーション適用とデプロイまで行う(push = 本番反映)。
デプロイジョブは `production` 環境で実行される。

リポジトリの **Settings > Secrets and variables > Actions** に以下を登録する。

| Secret | 内容 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | [API Tokens](https://dash.cloudflare.com/profile/api-tokens) で「Edit Cloudflare Workers」テンプレートに`D1: 編集`を追加して発行したトークン |
| `PROD_HOSTNAME` | 本番のカスタムドメイン(例: `attendance-manager.your-domain.com`) |
| `ACCESS_TEAM_DOMAIN` | Cloudflare Accessのteam domain(例: `your-team.cloudflareaccess.com`) |

デプロイ直前に、`wrangler.jsonc` のプレースホルダーをこれらの値で置き換える。

## PWA(Progressive Web App)

`apps/web` は `vite-plugin-pwa` によりPWA化しており、スマートフォン等のホーム画面に追加して
アプリのように起動できる。

- **オフライン対応の範囲**: ホーム画面への追加・スタンドアロン起動のみを目的としており、
  `/api/*` のレスポンス(勤怠データ等)は一切キャッシュしない(常にネットワークから最新データを
  取得する、`apps/web/pwa.config.ts` の `workbox.runtimeCaching` で `NetworkOnly` を明示)。
  オフライン時はSPAシェルは表示されるが、データの取得・更新はできない。
- **自動更新**: 新バージョンをデプロイすると、ユーザー操作なしで自動的に最新版に切り替わる
  (`registerType: "autoUpdate"` + `main.tsx` での `registerSW({ immediate: true })` の組み合わせ。
  詳細は `apps/web/pwa.config.ts` のコメント参照)。1時間毎に更新チェックのpollingも行う。
- **アイコンの再生成**: `apps/web/public/logo.svg` を編集後、以下を実行すると各サイズのPNG/ICOが
  再生成される(生成物は `apps/web/public/` にコミットする運用、ビルド毎の自動生成はしない)。

  ```bash
  cd apps/web
  pnpm generate-pwa-assets
  ```

- **動作確認**: `pnpm build` 時に `scripts/verify-pwa-build.mjs` が `dist/manifest.webmanifest` /
  `dist/sw.js` の存在と必須フィールドを自動検証する。実機でのホーム画面追加・スタンドアロン起動・
  アイコン表示・自動更新の確認は目視で行う必要がある(Chrome DevToolsのApplicationタブでの
  Manifest/Service Worker登録状態確認も有用)。

## 認証(Cloudflare Access)

認証はCloudflare Accessに一本化している(独自のID/パスワード認証は廃止済み)。

- Accessを通過したリクエストに付く `Cf-Access-Jwt-Assertion`(JWT)をWorker側で検証し、
  `email` クレームをユーザーIDとして使う(`workers/api/src/middleware/accessAuth.ts`)。
  署名・kid・aud・issuer・有効期限をすべて検証し、ヘッダを鵜呑みにしない。
- チームドメインとAUDタグは `workers/api/wrangler.jsonc` の `vars`
  (`ACCESS_TEAM_DOMAIN` / `ACCESS_AUD`)で設定。AUDタグはZero Trustダッシュボードの
  Access → Applications → 該当アプリで確認できる。
- workers.devサブドメインはAccessで保護されないため `workers_dev: false` を明示している。
- Accessセッション切れはフロントの `apiFetch` がopaqueredirectとして検出し、
  `/api/auth/refresh` へのトップレベル遷移で自動復帰する(`apps/web/src/api/client.ts`)。
- ログアウトは `/cdn-cgi/access/logout` への遷移で行う。

## 管理者機能(/admin)

環境変数 `ADMIN_EMAILS`(カンマ区切りのメールアドレス)に含まれるユーザーだけが
`/admin` ページを利用できる。ロールを持つテーブルは無く、この設定値のみで判定する。

個人のメールアドレスをリポジトリに含めないため、`wrangler.jsonc` の `vars` には書かない。

- 本番: `workers/api` で `npx wrangler secret put ADMIN_EMAILS` を実行して登録する
  (secretは以後の `wrangler deploy` でも保持される)。
- ローカル開発: `workers/api/.dev.vars` に `ADMIN_EMAILS=...` を書く。
- テスト: `workers/api/vitest.config.ts` の `miniflare.bindings` で固定値を与えている。

できること:

- 全ユーザー(`attendance_records` に1件以上記録があるメールアドレス)の出社率統計一覧、
  期間ナビゲーション、指定した出社率を下回るユーザーの抽出ができる。
- ユーザー行をクリックすると、そのユーザーのカレンダー・統計を閲覧できる(読み取り専用、編集不可)。
- 指定したユーザーの勤怠・設定・連携関係・エージェント接続を完全に削除できる
  ([docs/adr/0003-admin-user-deletion.md](docs/adr/0003-admin-user-deletion.md))。
- 全ユーザーのエージェント接続を一覧し、取り消せる(後述「エージェント接続(MCP)」参照)。
- 詳細は [docs/adr/0001-admin-feature.md](docs/adr/0001-admin-feature.md) を参照。

## アカウント連携(複数メールで1つのカレンダー)

同一人物が持つ複数のメールアドレスを1つのカレンダーに束ねる機能。設定画面の
「アカウント連携」セクションから操作する。

- **申請→承認**: メールアドレスA(所有者)でログインし、招きたいメールアドレスB宛に
  連携を申請する。B側でログインすると設定画面に申請が表示され、承認するとAのカレンダーを
  共有できる(Access認証にメール送信基盤が無いため、申請の通知・承認はすべてアプリ内で行う。
  受信申請があると設定ボタンにバッジが出る)。
- **見え方**: 承認後、Bのログインでは切り替えUIなしに自動的にAのカレンダーが表示・編集される
  (「1つのカレンダー」)。連携中はB自身の既存データ(休眠データ)は表示されない。
- **解除**: 所有者A・参加者Bのどちらからでも解除でき、解除するとBは自分のカレンダーに戻る
  (休眠データが復活する)。破壊的なデータ移行を行わないため常に可逆。
- **実装**: データ実体はメールアドレス(`user_id`)キーのまま。連携は「読み書きの解決先を
  付け替えるリゾルバ」1枚で実現している(`withCalendarOwner`)。構造はフラット・スターに
  限定(連鎖・多重参加は不可)。詳細は
  [docs/adr/0002-account-linking.md](docs/adr/0002-account-linking.md) を参照。

## エージェント接続(MCP)

自律型AIエージェントが MCP(Streamable HTTP、`https://<本番ドメイン>/mcp`)で勤怠を操作できる。
設計は [docs/adr/0004-agent-connections-and-own-oauth-server.md](docs/adr/0004-agent-connections-and-own-oauth-server.md) を参照。

- **OAuth 2.1に対応したエージェント**: `/mcp` のURLを登録するだけでよい。エージェントが `/mcp` の401から
  認可サーバーを見つけ、クライアント登録(CIMDかDCR)→ブラウザで同意画面(`/oauth/authorize`、Accessでログイン)→
  トークン発行まで自動で進む。
- **OAuthに対応していないエージェント**: 設定画面の「エージェント接続」でトークンを発行し、
  `Authorization: Bearer <トークン>` として登録する(トークンは発行直後に一度だけ表示される)。
- できるのは日常の操作(勤怠の閲覧・記録・削除、出社率、設定、会社の休日・出勤日、スケジュールの一括適用)だけ。
  アカウント連携・管理者機能・全件リセットはできない。操作先は発行したユーザーのカレンダー
  (アカウント連携中は共有しているカレンダー)。
- 接続は設定画面の一覧から取り消せる。90日使われなければ自動で失効する。
- **Accessのポリシーからユーザーを外しても、その人の接続は動き続ける**(`/mcp` はAccessを通らないため)。
  外した人の接続は、管理画面(`/admin`)の「エージェント接続」で取り消すこと。

### Cloudflare Access の設定(本番で必須・ダッシュボードで行う)

エージェントのサーバーはAccessのログインを通れないため、次のパスだけをAccessの **Bypass** にする。
**同意画面 `/oauth/authorize` とそれ以外のパス(`/`・`/api/*`・`/admin` など)はBypassしないこと**
(同意画面はAccessのJWTで「誰が許可したか」を決めている)。

| パス | 用途 |
|---|---|
| `/mcp` | MCPエンドポイント(Bearerトークンで認証) |
| `/oauth/token` | トークン発行・リフレッシュ |
| `/oauth/register` | クライアント登録(DCR) |
| `/oauth/revoke` | トークン取り消し |
| `/.well-known/*` | 認可サーバー・保護リソースのメタデータ |

手順(Zero Trust ダッシュボード):

1. **Access → Applications → Add an application → Self-hosted** を選ぶ。
2. アプリケーション名を `attendance-manager (agents)` などにし、**Public hostname** に本番ドメインと
   パス `mcp` を指定する。続けて **Add public hostname** で同じドメインに `oauth/token`・`oauth/register`・
   `oauth/revoke`・`.well-known/*` を追加する(5件)。
3. ポリシーを1つ作り、**Action: Bypass**、**Include: Everyone** にする。
4. 保存する。既存のアプリ(ドメイン全体を保護しているもの)は変更しない。パスを指定したアプリの方が
   優先されるため、上の5パスだけがAccessの外に出る。
5. 確認:
   - `curl -i https://<本番ドメイン>/.well-known/oauth-authorization-server` が200のJSONを返す。
   - `curl -i -X POST https://<本番ドメイン>/mcp` が401と
     `WWW-Authenticate: Bearer resource_metadata="..."` を返す(Accessのログイン画面への302ではない)。
   - ブラウザで `https://<本番ドメイン>/oauth/authorize` を開くとAccessのログインが求められる。
   - `curl -i https://<本番ドメイン>/api/auth/me` がAccessのログインへの302を返す(Bypassになっていない)。

その他:

- Worker側の設定(`wrangler.jsonc`)はデプロイで反映される: `run_worker_first` へのパス追加、
  `global_fetch_strictly_public`(CIMD取得のSSRF対策)、DCRの回数制限(`ratelimits`)、期限切れデータの
  日次掃除(`triggers.crons`)。追加のsecretは不要。
- テーブルは `0004_agent_connections.sql` で追加される(CIのデプロイでマイグレーションが適用される)。

## 既知の制約・今後の課題

- PNG画像エクスポート(html2canvasを使った期間カレンダーの画像化)は未実装。JSONエクスポートのみ対応。
- ダークモードは視認性の問題があったため廃止し、端末設定によらず常にライトモードで表示する。
- PWAの実機でのホーム画面追加・自動更新の最終確認は未実施(上記「PWA」セクション参照)。

## ライセンス

[MIT License](LICENSE)
