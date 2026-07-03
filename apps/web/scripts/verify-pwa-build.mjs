// vite buildの成果物にPWAに必要なファイルが正しく出力されているかを検証する。
// build時にvite-plugin-pwaの設定が壊れて無効化された場合、これで検知できるようにする。
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

function fail(message) {
  console.error(`[verify-pwa-build] ${message}`);
  process.exitCode = 1;
}

const manifestPath = path.join(distDir, "manifest.webmanifest");
if (!existsSync(manifestPath)) {
  fail("dist/manifest.webmanifest が見つかりません");
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const requiredFields = ["name", "short_name", "start_url", "display", "icons"];
  for (const field of requiredFields) {
    if (!(field in manifest)) {
      fail(`manifest.webmanifest に必須フィールド "${field}" がありません`);
    }
  }
  const sizes = (manifest.icons ?? []).map((icon) => icon.sizes);
  for (const requiredSize of ["192x192", "512x512"]) {
    if (!sizes.includes(requiredSize)) {
      fail(`manifest.webmanifest のiconsに ${requiredSize} が含まれていません`);
    }
  }
}

const swPath = path.join(distDir, "sw.js");
if (!existsSync(swPath)) {
  fail("dist/sw.js が見つかりません");
}

if (process.exitCode === 1) {
  console.error("[verify-pwa-build] PWAビルド成果物の検証に失敗しました");
} else {
  console.log("[verify-pwa-build] PWAビルド成果物の検証に成功しました");
}
