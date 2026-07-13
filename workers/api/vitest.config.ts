import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // ローカル開発用の .dev.vars(DEV_USER_EMAIL による認証バイパス)がテスト環境へ
          // 漏れると、無認証リクエストが固定ユーザーとして通ってしまい「未認証は401」の
          // 検証ができなくなる。テストは本番同様にバイパス無効(空)で実行する。
          bindings: { DEV_USER_EMAIL: "" },
        },
      },
    },
  },
});
