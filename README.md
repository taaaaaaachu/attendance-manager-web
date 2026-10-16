# Attendance Manager Web版

出社・在宅管理アプリのWeb版。[attendance-manager](../attendance-manager)(Tauriデスクトップアプリ)とは
**完全に独立した別プロダクト**として、Cloudflare Workers上で動作する。デスクトップ版とのデータ連携は行わない。

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

   `http://127.0.0.1:8787` でアプリ全体(ログイン画面〜カレンダー)にアクセスできる。

フロントエンドのみをHMR付きで素早く開発したい場合は `apps/web` で `pnpm dev`(Vite、ポート5173)を使う。
`vite.config.ts` で `/api/*` を `http://127.0.0.1:8787` にプロキシしているため、`workers/api` 側の
`pnpm dev` を別ターミナルで併走させておくこと。

## テスト

```bash
# packages/shared のロジックテスト
cd packages/shared && pnpm test

# workers/api の統合テスト(@cloudflare/vitest-pool-workers、実際のWorkersランタイム上で実行)
cd workers/api && pnpm test
```

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

4. フロントエンドをビルドしてデプロイ:

   ```bash
   cd apps/web && pnpm build
   cd ../../workers/api && pnpm deploy
   ```

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

- 全ユーザー(`attendance_records` に1件以上記録があるメールアドレス)の出社率統計一覧、
  期間ナビゲーション、指定した出社率を下回るユーザーの抽出ができる。
- ユーザー行をクリックすると、そのユーザーのカレンダー・統計を閲覧できる(読み取り専用、編集不可)。
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

## 既知の制約・今後の課題

- PNG画像エクスポート(html2canvasを使った期間カレンダーの画像化)は未実装。JSONエクスポートのみ対応。
- ダークモードは視認性の問題があったため廃止し、端末設定によらず常にライトモードで表示する。
- PWAの実機でのホーム画面追加・自動更新の最終確認は未実施(上記「PWA」セクション参照)。
