import type { AttendanceRecord } from "@attendance/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTileClassName, isTodayDate } from "./calendarUtils";

const EMPTY = new Set<string>();
const PERIOD = { startDate: "2026-06-16", endDate: "2026-07-15" };

function records(entries: [string, AttendanceRecord["status"]][]): Map<string, AttendanceRecord> {
  const map = new Map<string, AttendanceRecord>();
  for (const [date, status] of entries) {
    map.set(date, { date, status });
  }
  return map;
}

describe("getTileClassName", () => {
  it("期間外の日付はtile-disabledになる(左右クリック無効化の判定にも使う値と一致させる必要がある)", () => {
    const result = getTileClassName({
      date: new Date(2026, 5, 15), // 2026-06-15、期間開始日の前日
      period: PERIOD,
      records: records([]),
      holidays: EMPTY,
      companyHolidays: EMPTY,
      companyWorkingDays: EMPTY,
    });
    expect(result).toBe("tile-disabled");
  });

  it("期間外でも休日(土日)の日はtile-disabledとtile-holidayが両方付与される", () => {
    const result = getTileClassName({
      date: new Date(2026, 5, 13), // 2026-06-13は土曜、期間開始日より前
      period: PERIOD,
      records: records([]),
      holidays: EMPTY,
      companyHolidays: EMPTY,
      companyWorkingDays: EMPTY,
    });
    expect(result).toBe("tile-disabled tile-holiday");
  });

  it("出社ステータスのある日はtile-office", () => {
    const result = getTileClassName({
      date: new Date(2026, 5, 16),
      period: PERIOD,
      records: records([["2026-06-16", "office"]]),
      holidays: EMPTY,
      companyHolidays: EMPTY,
      companyWorkingDays: EMPTY,
    });
    expect(result).toBe("tile-office");
  });

  it("在宅ステータスのある日はtile-remote", () => {
    const result = getTileClassName({
      date: new Date(2026, 5, 16),
      period: PERIOD,
      records: records([["2026-06-16", "remote"]]),
      holidays: EMPTY,
      companyHolidays: EMPTY,
      companyWorkingDays: EMPTY,
    });
    expect(result).toBe("tile-remote");
  });

  it("有給ステータスのある日はtile-paidleave", () => {
    const result = getTileClassName({
      date: new Date(2026, 5, 16),
      period: PERIOD,
      records: records([["2026-06-16", "paidleave"]]),
      holidays: EMPTY,
      companyHolidays: EMPTY,
      companyWorkingDays: EMPTY,
    });
    expect(result).toBe("tile-paidleave");
  });

  it("ステータス未設定で祝日の日はtile-holiday(2026-06-20は土曜)", () => {
    const result = getTileClassName({
      date: new Date(2026, 5, 20),
      period: PERIOD,
      records: records([]),
      holidays: EMPTY,
      companyHolidays: EMPTY,
      companyWorkingDays: EMPTY,
    });
    expect(result).toBe("tile-holiday");
  });

  it("ステータス未設定の平日は空文字", () => {
    const result = getTileClassName({
      date: new Date(2026, 5, 16), // 月曜
      period: PERIOD,
      records: records([]),
      holidays: EMPTY,
      companyHolidays: EMPTY,
      companyWorkingDays: EMPTY,
    });
    expect(result).toBe("");
  });

  it("ステータスが設定されていれば休日でもステータスの色を優先する", () => {
    const result = getTileClassName({
      date: new Date(2026, 5, 20), // 土曜だが出社扱い
      period: PERIOD,
      records: records([["2026-06-20", "office"]]),
      holidays: EMPTY,
      companyHolidays: EMPTY,
      companyWorkingDays: EMPTY,
    });
    expect(result).toBe("tile-office");
  });

  describe("今日の日付にtile-todayが付与される", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 16)); // 2026-06-16を「今日」に固定
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("ステータス未設定の平日が今日の場合はtile-todayのみ", () => {
      const result = getTileClassName({
        date: new Date(2026, 5, 16),
        period: PERIOD,
        records: records([]),
        holidays: EMPTY,
        companyHolidays: EMPTY,
        companyWorkingDays: EMPTY,
      });
      expect(result).toBe("tile-today");
    });

    it("ステータスありの今日はステータスのクラスとtile-todayが両方付与される", () => {
      const result = getTileClassName({
        date: new Date(2026, 5, 16),
        period: PERIOD,
        records: records([["2026-06-16", "office"]]),
        holidays: EMPTY,
        companyHolidays: EMPTY,
        companyWorkingDays: EMPTY,
      });
      expect(result).toBe("tile-office tile-today");
    });

    it("今日以外の日付にはtile-todayが付与されない", () => {
      const result = getTileClassName({
        date: new Date(2026, 5, 17),
        period: PERIOD,
        records: records([]),
        holidays: EMPTY,
        companyHolidays: EMPTY,
        companyWorkingDays: EMPTY,
      });
      expect(result).not.toContain("tile-today");
    });
  });
});

describe("isTodayDate", () => {
  it("基準日と一致する日付文字列はtrue", () => {
    expect(isTodayDate("2026-07-04", new Date(2026, 6, 4))).toBe(true);
  });

  it("基準日と異なる日付文字列はfalse", () => {
    expect(isTodayDate("2026-07-05", new Date(2026, 6, 4))).toBe(false);
  });
});
