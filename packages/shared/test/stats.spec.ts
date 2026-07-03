import { describe, expect, it } from "vitest";
import { calculateStats } from "../src/stats";
import type { AttendanceRecord } from "../src/types";

const EMPTY = new Set<string>();

function recordsMap(entries: [string, AttendanceRecord["status"]][]): Map<string, AttendanceRecord> {
  const map = new Map<string, AttendanceRecord>();
  for (const [date, status] of entries) {
    map.set(date, { date, status });
  }
  return map;
}

describe("calculateStats", () => {
  it("出社率は 出社日数 / (出社日数 + 在宅日数) で計算される", () => {
    const period = { startDate: "2026-02-02", endDate: "2026-02-06" }; // 平日5日(月-金)
    const records = recordsMap([
      ["2026-02-02", "office"],
      ["2026-02-03", "office"],
      ["2026-02-04", "remote"],
      ["2026-02-05", "remote"],
      // 2026-02-06は未設定
    ]);

    const stats = calculateStats(records, period, EMPTY, EMPTY, EMPTY, 50, "2026-02-01");

    expect(stats.officeDays).toBe(2);
    expect(stats.remoteDays).toBe(2);
    expect(stats.officeRate).toBeCloseTo(0.5);
    expect(stats.totalDays).toBe(5); // 有給なし
  });

  it("有給は totalDays から除外される", () => {
    const period = { startDate: "2026-02-02", endDate: "2026-02-06" };
    const records = recordsMap([
      ["2026-02-02", "office"],
      ["2026-02-03", "paidleave"],
    ]);

    const stats = calculateStats(records, period, EMPTY, EMPTY, EMPTY, 50, "2026-02-01");

    expect(stats.totalDays).toBe(4); // 5営業日 - 有給1日
    expect(stats.officeDays).toBe(1);
  });

  it("出社・在宅がどちらも0件なら出社率は0", () => {
    const period = { startDate: "2026-02-02", endDate: "2026-02-06" };
    const stats = calculateStats(recordsMap([]), period, EMPTY, EMPTY, EMPTY, 50, "2026-02-01");
    expect(stats.officeRate).toBe(0);
  });

  it("remainingDaysは今日より後の営業日数", () => {
    const period = { startDate: "2026-02-02", endDate: "2026-02-06" };
    const stats = calculateStats(recordsMap([]), period, EMPTY, EMPTY, EMPTY, 50, "2026-02-03");
    // 2/4, 2/5, 2/6 の3日が残り
    expect(stats.remainingDays).toBe(3);
  });

  it("requiredOfficeDaysは目標達成に必要な残り出社日数(切り上げ)", () => {
    const period = { startDate: "2026-02-02", endDate: "2026-02-06" }; // 5営業日
    const records = recordsMap([["2026-02-02", "office"]]);
    // target=50% → 5 * 0.5 = 2.5 → ceil = 3。既に1日出社済みなので残り2日必要。
    const stats = calculateStats(records, period, EMPTY, EMPTY, EMPTY, 50, "2026-02-01");
    expect(stats.requiredOfficeDays).toBe(2);
  });

  it("目標を既に達成していればrequiredOfficeDaysは0", () => {
    const period = { startDate: "2026-02-02", endDate: "2026-02-06" };
    const records = recordsMap([
      ["2026-02-02", "office"],
      ["2026-02-03", "office"],
      ["2026-02-04", "office"],
    ]);
    const stats = calculateStats(records, period, EMPTY, EMPTY, EMPTY, 50, "2026-02-01");
    expect(stats.requiredOfficeDays).toBe(0);
  });
});
