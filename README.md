# Attendance Manager Web版

出社・在宅管理アプリのWeb版。[attendance-manager](../attendance-manager)(Tauriデスクトップアプリ)とは
**完全に独立した別プロダクト**として、Cloudflare Workers上で動作する。デスクトップ版とのデータ連携は行わない。

## 技術スタック

- **Cloudflare Workers**: 単一WorkerでAPI(Hono)とフロントエンド静的アセットを両方配信
- **Cloudflare D1**: データストア(users / sessions / attendance_records / company_holidays / company_working_days / user_settings / japan_holidays)
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

1. D1のローカルマイグレーションを適用(初回のみ):

   ```bash
   cd workers/api
   pnpm db:migrate:local
   ```

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

   出力される `database_id` を `workers/api/wrangler.jsonc` の `d1_databases[0].database_id` に反映する
   (現在はプレースホルダー `00000000-0000-0000-0000-000000000000` が入っている)。

3. リモートDBにマイグレーションを適用:

   ```bash
   pnpm db:migrate:remote
   ```

4. フロントエンドをビルドしてデプロイ:

   ```bash
   cd apps/web && pnpm build
   cd ../../workers/api && pnpm deploy
   ```

## セキュリティ上の注意・トレードオフ

- パスワードは PBKDF2-HMAC-SHA256 でハッシュ化している。**反復回数は15,000回**に設定しており、
  OWASP推奨値(600,000回)より大幅に低い。これはCloudflare Workers Freeプランの
  「1リクエストあたりCPU時間10ms」という制限内に収めるためのトレードオフ。実測では15,000回で
  約6ms(`workers/api/src/routes/auth.ts` のコメント参照)。将来的に有料プランへ移行する場合は
  反復回数を引き上げることを検討する。
- セッションはCookie(HttpOnly, Secure, SameSite=Lax)+D1の`sessions`テーブルで管理。
- ログイン失敗はレート制限(直近5分で5回失敗するとロックアウト)している。

## 既知の制約・今後の課題

- PNG画像エクスポート(html2canvasを使った期間カレンダーの画像化)は未実装。JSONエクスポートのみ対応。
- レスポンシブ対応・ダークモードは実装済みだが、実機での見た目の最終確認は未実施。
