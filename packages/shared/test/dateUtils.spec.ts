import { describe, expect, it } from "vitest";
import {
  adjustStartDateForBusinessDay,
  applyClosingDayShift,
  getBusinessDays,
  getCurrentPeriod,
  getMandatoryOfficeDays,
  isHoliday,
  resolveClosingDate,
} from "../src/dateUtils";

const EMPTY = new Set<string>();

describe("resolveClosingDate", () => {
  it("closingDay=0は月末を返す(平年2月)", () => {
    expect(resolveClosingDate(2026, 2, 0)).toBe("2026-02-28");
  });

  it("closingDay=0は月末を返す(閏年2月)", () => {
    expect(resolveClosingDate(2024, 2, 0)).toBe("2024-02-29");
  });

  it("closingDayが月内に存在すればその日を返す", () => {
    expect(resolveClosingDate(2026, 2, 15)).toBe("2026-02-15");
  });

  it("closingDayが月内に存在しない場合は月末にフォールバックする", () => {
    // 2026年2月は28日までなので31日は存在しない
    expect(resolveClosingDate(2026, 2, 31)).toBe("2026-02-28");
  });

  it("12月のclosingDay=0は12月31日を返す(年またぎ)", () => {
    expect(resolveClosingDate(2026, 12, 0)).toBe("2026-12-31");
  });
});

describe("isHoliday", () => {
  it("土曜日は休日", () => {
    expect(isHoliday("2026-02-14", EMPTY, EMPTY, EMPTY)).toBe(true); // 2026-02-14は土曜
  });

  it("平日は休日ではない", () => {
    expect(isHoliday("2026-02-16", EMPTY, EMPTY, EMPTY)).toBe(false); // 月曜
  });

  it("国民の祝日は休日", () => {
    const holidays = new Set(["2026-02-11"]);
    expect(isHoliday("2026-02-11", holidays, EMPTY, EMPTY)).toBe(true);
  });

  it("会社休日は休日", () => {
    const companyHolidays = new Set(["2026-02-16"]);
    expect(isHoliday("2026-02-16", EMPTY, companyHolidays, EMPTY)).toBe(true);
  });

  it("会社営業日に指定されていれば土日祝でも休日ではない", () => {
    const holidays = new Set(["2026-02-11"]);
    const companyWorkingDays = new Set(["2026-02-11"]);
    expect(isHoliday("2026-02-11", holidays, EMPTY, companyWorkingDays)).toBe(false);
  });
});

describe("applyClosingDayShift", () => {
  it("noneはそのまま返す", () => {
    expect(applyClosingDayShift("2026-02-14", "none", EMPTY, EMPTY, EMPTY)).toBe("2026-02-14");
  });

  it("previousは休日の場合、前営業日まで戻る", () => {
    // 2026-02-14は土曜、13日は金曜(平日)
    expect(applyClosingDayShift("2026-02-14", "previous", EMPTY, EMPTY, EMPTY)).toBe("2026-02-13");
  });

  it("nextは休日の場合、翌営業日まで進む", () => {
    // 2026-02-14は土曜、15日は日曜、16日は月曜(平日)
    expect(applyClosingDayShift("2026-02-14", "next", EMPTY, EMPTY, EMPTY)).toBe("2026-02-16");
  });
});

describe("adjustStartDateForBusinessDay", () => {
  it("休日の場合は翌営業日まで進める", () => {
    expect(adjustStartDateForBusinessDay("2026-02-14", EMPTY, EMPTY, EMPTY)).toBe("2026-02-16");
  });

  it("営業日ならそのまま返す", () => {
    expect(adjustStartDateForBusinessDay("2026-02-16", EMPTY, EMPTY, EMPTY)).toBe("2026-02-16");
  });
});

describe("getCurrentPeriod", () => {
  it("締め日=15, シフト=none, today=2/20 → 期間は2/16〜3/15", () => {
    const period = getCurrentPeriod("2026-02-20", 15, "none", EMPTY, EMPTY, EMPTY);
    expect(period).toEqual({ startDate: "2026-02-16", endDate: "2026-03-15" });
  });

  it("締め日=15, シフト=none, today=2/10 → 期間は1/16〜2/15", () => {
    const period = getCurrentPeriod("2026-02-10", 15, "none", EMPTY, EMPTY, EMPTY);
    expect(period).toEqual({ startDate: "2026-01-16", endDate: "2026-02-15" });
  });

  it("締め日=0(月末), today=3/10 → 期間は3/1〜3/31", () => {
    const period = getCurrentPeriod("2026-03-10", 0, "none", EMPTY, EMPTY, EMPTY);
    expect(period).toEqual({ startDate: "2026-03-01", endDate: "2026-03-31" });
  });

  it("today=締め日ちょうどの場合は今月の期間に含まれる", () => {
    const period = getCurrentPeriod("2026-02-15", 15, "none", EMPTY, EMPTY, EMPTY);
    expect(period).toEqual({ startDate: "2026-01-16", endDate: "2026-02-15" });
  });

  it("年またぎ: 締め日=15, today=1/10 → 期間は前年12/16〜1/15", () => {
    const period = getCurrentPeriod("2026-01-10", 15, "none", EMPTY, EMPTY, EMPTY);
    expect(period).toEqual({ startDate: "2025-12-16", endDate: "2026-01-15" });
  });
});

describe("getMandatoryOfficeDays", () => {
  it("ルールで指定した日が期間内にあれば対象になる", () => {
    // 2026-02-01は日曜のため翌営業日(2026-02-02)にずれる。2026-02-16は月曜なのでそのまま。
    const period = { startDate: "2026-02-01", endDate: "2026-02-28" };
    const days = getMandatoryOfficeDays(period, EMPTY, EMPTY, EMPTY, [1, 16]);
    expect(days).toEqual(["2026-02-02", "2026-02-16"]);
  });

  it("対象日が休日の場合は翌営業日にずれる", () => {
    // 2026-02-01は日曜 → 翌営業日の2026-02-02(月)にずれる
    const period = { startDate: "2026-02-01", endDate: "2026-02-28" };
    const days = getMandatoryOfficeDays(period, EMPTY, EMPTY, EMPTY, [1]);
    expect(days).toEqual(["2026-02-02"]);
  });

  it("月に存在しない日(31日等)は無視する", () => {
    const period = { startDate: "2026-02-01", endDate: "2026-02-28" };
    const days = getMandatoryOfficeDays(period, EMPTY, EMPTY, EMPTY, [31]);
    expect(days).toEqual([]);
  });
});

describe("getBusinessDays", () => {
  it("土日祝を除いた営業日のみを返す", () => {
    // 2026-02-01(日)〜2026-02-08(日) の範囲。祝日なしと仮定。
    const period = { startDate: "2026-02-01", endDate: "2026-02-08" };
    const days = getBusinessDays(period, EMPTY, EMPTY, EMPTY);
    expect(days).toEqual(["2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05", "2026-02-06"]);
  });

  it("期間開始日が休日の場合は翌営業日から開始する", () => {
    const period = { startDate: "2026-02-01", endDate: "2026-02-01" }; // 日曜のみの期間
    const days = getBusinessDays(period, EMPTY, EMPTY, EMPTY);
    expect(days).toEqual([]);
  });
});
