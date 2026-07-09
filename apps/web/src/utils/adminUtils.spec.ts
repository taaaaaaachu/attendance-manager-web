import type { AdminUserSummary } from "@attendance/shared";
import { describe, expect, it } from "vitest";
import { filterUsersBelowRate } from "./adminUtils";

function makeUser(userId: string, officeRate: number): AdminUserSummary {
  return {
    userId,
    closingDay: 15,
    closingDayShift: "none",
    targetOfficeRate: 50,
    period: { startDate: "2026-06-16", endDate: "2026-07-15" },
    stats: {
      totalDays: 10,
      officeDays: 5,
      remoteDays: 5,
      officeRate,
      remainingDays: 0,
      requiredOfficeDays: 0,
    },
  };
}

describe("filterUsersBelowRate", () => {
  const users = [makeUser("a@example.com", 0.8), makeUser("b@example.com", 0.3), makeUser("c@example.com", 0.5)];

  it("閾値未指定(null)なら全件を返す", () => {
    expect(filterUsersBelowRate(users, null)).toEqual(users);
  });

  it("閾値を下回るユーザーだけを抽出する", () => {
    const result = filterUsersBelowRate(users, 50);
    expect(result.map((u) => u.userId)).toEqual(["b@example.com"]);
  });

  it("閾値ちょうどのユーザーは含まれない(下回る、のみ)", () => {
    const result = filterUsersBelowRate(users, 50);
    expect(result.map((u) => u.userId)).not.toContain("c@example.com");
  });

  it("閾値0なら誰も抽出されない", () => {
    expect(filterUsersBelowRate(users, 0)).toEqual([]);
  });
});
