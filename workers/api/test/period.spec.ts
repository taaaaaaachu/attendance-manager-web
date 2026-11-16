import { describe, expect, it } from "vitest";
import { todayInJapan } from "../src/lib/period";

describe("todayInJapan", () => {
  it("UTCで前日でも日本時間の日付を返す(JST 11/16 08:59 = UTC 11/15 23:59)", () => {
    expect(todayInJapan(new Date("2026-11-15T23:59:00Z"))).toBe("2026-11-16");
  });

  it("日本時間の深夜0時直前はその日のまま", () => {
    expect(todayInJapan(new Date("2026-11-16T14:59:00Z"))).toBe("2026-11-16");
  });

  it("年またぎも日本時間で判定する", () => {
    expect(todayInJapan(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });
});
