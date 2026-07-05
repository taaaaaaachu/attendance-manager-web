import { describe, expect, it } from "vitest";
import { pwaOptions } from "../../pwa.config";

describe("pwaOptions", () => {
  it("autoUpdateだが、自動リロードのためregisterSWを手動で呼べるようinjectRegisterはfalseにする", () => {
    expect(pwaOptions.registerType).toBe("autoUpdate");
    expect(pwaOptions.injectRegister).toBe(false);
  });

  it("manifestに必須フィールドと192/512サイズのアイコンが含まれる", () => {
    const manifest = pwaOptions.manifest;
    if (!manifest) throw new Error("manifestが無効化されている");

    expect(manifest.name).toBe("出社・在宅管理");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");

    const icons = manifest.icons ?? [];
    const sizes = icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");

    const maskable = icons.find((icon) => icon.purpose === "maskable");
    expect(maskable).toBeDefined();
  });

  it("/api/配下はNetworkOnlyでキャッシュしない", () => {
    const runtimeCaching = pwaOptions.workbox?.runtimeCaching;
    expect(runtimeCaching).toBeDefined();

    // workboxのRegExpRouteはパスではなくフルURLに対してテストするため、RegExpの
    // パス先頭一致パターンは決してマッチしない(死んだルールになる)。関数形式で、
    // 実際にルーティング時へ渡されるのと同じフルURLでマッチすることを確認する。
    const matches = (url: URL) =>
      runtimeCaching?.find((rule) => {
        const pattern = rule.urlPattern;
        return typeof pattern === "function" && pattern({ url } as Parameters<typeof pattern>[0]);
      });

    const apiRule = matches(new URL("https://example.com/api/records"));
    expect(apiRule).toBeDefined();
    expect(apiRule?.handler).toBe("NetworkOnly");

    expect(matches(new URL("https://example.com/assets/index.js"))).toBeUndefined();
  });

  it("navigateFallbackDenylistで/api/配下をSPAフォールバック対象から除外する", () => {
    const denylist = pwaOptions.workbox?.navigateFallbackDenylist;
    expect(denylist?.some((pattern) => pattern.test("/api/records"))).toBe(true);
    expect(denylist?.some((pattern) => pattern.test("/settings"))).toBe(false);
  });
});
