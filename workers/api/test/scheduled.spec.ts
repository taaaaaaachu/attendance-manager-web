import { createScheduledController, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/index";
import { issueAuthorizationCode } from "../src/lib/oauth";
import { applyMigrations } from "./helpers/migrations";

beforeAll(async () => {
  await applyMigrations(env.DB);
});

describe("scheduled", () => {
  it("期限切れの認可コードを消す", async () => {
    await issueAuthorizationCode(
      env.DB,
      { clientId: "c", redirectUri: "https://a.example/cb", codeChallenge: "x", userEmail: "cron@example.com", name: "n" },
      Date.now() - 120_000,
    );
    await worker.scheduled(createScheduledController(), env);
    expect(await env.DB.prepare("SELECT 1 FROM oauth_codes WHERE user_email = 'cron@example.com'").first()).toBeNull();
  });
});
