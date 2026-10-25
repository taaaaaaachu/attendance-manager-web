import type { AttendanceRecord, AttendanceStats, AttendanceStatus, Period } from "@attendance/shared";
import { calculateStats, getBusinessDays, getWeekday } from "@attendance/shared";
import { getAllRecords, upsertRecord } from "./data";
import { loadPeriodContext } from "./period";

export interface ScheduleResult {
  applied: boolean;
  /** 適用すると目標出社率を下回るため、適用しなかった */
  warning: boolean;
  stats: AttendanceStats;
  period: Period;
}

/**
 * 期間内の営業日を、在宅曜日なら在宅・それ以外は出社で一括記録する。画面のAPIとMCPの両方から使う。
 * 既に有給の日は上書きしない。適用後の出社率が目標を下回るときは、force でない限り適用しない。
 */
export async function applySchedule(
  db: D1Database,
  userId: string,
  input: { remoteWeekdays: number[]; force: boolean; offsetMonths: number },
): Promise<ScheduleResult> {
  const remoteWeekdays = new Set(input.remoteWeekdays);
  const [{ settings, companyHolidays, companyWorkingDays, japanHolidays, today, period }, existingRecords] =
    await Promise.all([loadPeriodContext(db, userId, input.offsetMonths), getAllRecords(db, userId)]);
  const businessDays = getBusinessDays(period, japanHolidays, companyHolidays, companyWorkingDays);

  // 既に有給休暇が設定されている日は上書きしない
  const plannedStatuses = new Map<string, AttendanceStatus>();
  for (const date of businessDays) {
    if (existingRecords.get(date)?.status === "paidleave") continue;
    plannedStatuses.set(date, remoteWeekdays.has(getWeekday(date)) ? "remote" : "office");
  }

  const simulatedRecords = new Map<string, AttendanceRecord>(existingRecords);
  for (const [date, status] of plannedStatuses) {
    simulatedRecords.set(date, { date, status });
  }

  const stats = calculateStats(
    simulatedRecords,
    period,
    japanHolidays,
    companyHolidays,
    companyWorkingDays,
    settings.targetOfficeRate,
    today,
  );

  if (!input.force && stats.officeRate * 100 < settings.targetOfficeRate) {
    return { applied: false, warning: true, stats, period };
  }

  for (const [date, status] of plannedStatuses) {
    await upsertRecord(db, userId, date, status);
  }

  return { applied: true, warning: false, stats, period };
}
