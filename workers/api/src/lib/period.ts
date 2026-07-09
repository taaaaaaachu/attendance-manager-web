import type { AttendanceStats, Period, UserSettings } from "@attendance/shared";
import { calculateStats, formatDate, getPeriodForMonthOffset } from "@attendance/shared";
import {
  getAllRecords,
  getCompanyHolidays,
  getCompanyWorkingDays,
  getJapanHolidays,
  getUserSettings,
} from "./data";

export interface PeriodContext {
  settings: UserSettings;
  companyHolidays: Set<string>;
  companyWorkingDays: Set<string>;
  japanHolidays: Set<string>;
  today: string;
  period: Period;
}

/** 指定ユーザーの設定に基づく期間(offsetMonthsだけ前後にずらした期間)を組み立てる */
export async function loadPeriodContext(
  db: D1Database,
  userId: string,
  offsetMonths: number,
): Promise<PeriodContext> {
  const settings = await getUserSettings(db, userId);
  const [companyHolidays, companyWorkingDays, japanHolidays] = await Promise.all([
    getCompanyHolidays(db, userId),
    getCompanyWorkingDays(db, userId),
    getJapanHolidays(db),
  ]);
  const today = formatDate(new Date());
  const period = getPeriodForMonthOffset(
    today,
    offsetMonths,
    settings.closingDay,
    settings.closingDayShift,
    japanHolidays,
    companyHolidays,
    companyWorkingDays,
  );
  return { settings, companyHolidays, companyWorkingDays, japanHolidays, today, period };
}

/** 指定ユーザーの期間コンテキストと、その期間の出社率統計をまとめて計算する */
export async function loadStatsForUser(
  db: D1Database,
  userId: string,
  offsetMonths: number,
): Promise<{ context: PeriodContext; stats: AttendanceStats }> {
  const context = await loadPeriodContext(db, userId, offsetMonths);
  const allRecords = await getAllRecords(db, userId);
  const stats = calculateStats(
    allRecords,
    context.period,
    context.japanHolidays,
    context.companyHolidays,
    context.companyWorkingDays,
    context.settings.targetOfficeRate,
    context.today,
  );
  return { context, stats };
}
