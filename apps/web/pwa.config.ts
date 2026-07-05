import type { VitePWAOptions } from "vite-plugin-pwa";

/**
 * vite-plugin-pwaの設定。素のオブジェクトとして切り出すことでvite.config.tsから独立してテストできる。
 *
 * 方針(README「PWA」セクション参照):
 * - インストール可能化のみを目的とし、/api/* のレスポンスは一切キャッシュしない(NetworkOnly)。
 * - 新バージョンは自動更新する。registerType: "autoUpdate" だけではブラウザの自動リロードは
 *   発生しないため(workboxのskipWaiting/clientsClaimが有効になるのみ)、
 *   injectRegister: false にしてsrc/main.tsx側でregisterSW({ immediate: true }) を明示的に呼ぶ。
 */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: "autoUpdate",
  injectRegister: false,
  manifest: {
    name: "出社・在宅管理",
    short_name: "出社在宅管理",
    description: "出社・在宅・有給のステータスをカレンダーで記録し、期間ごとの統計を確認できる勤怠管理アプリ",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "ja",
    theme_color: "#2563eb",
    background_color: "#f5f6f8",
    icons: [
      { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
      { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
      { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        // RegExpを渡すとパスではなくフルURL(https://...)に対してテストされるため、
        // /^\/api\// のようなパス先頭一致は一切マッチしない(ルールが死ぬ)。関数形式で判定する。
        urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
    ],
  },
};
