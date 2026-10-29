import { vi } from "vitest";

const routes = new Map<string, () => Response>();

/**
 * 外部へのfetchを差し替え、urlへの送信にrespondの結果を返す。
 * 登録していないURLへの送信は失敗させ、テストから外部へ通信が出ないようにする。
 * (vitest-pluginではcloudflare:testのfetchMockが廃止されたため、globalThis.fetchを直接モックする)
 */
export function mockFetch(url: string, respond: () => Response): void {
  if (!vi.isMockFunction(globalThis.fetch)) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const target = input instanceof Request ? input.url : String(input);
      const handler = routes.get(target);
      if (!handler) throw new Error(`未登録の外部fetch: ${target}`);
      return handler();
    });
  }
  routes.set(url, respond);
}
