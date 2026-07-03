import { getBusinessDays } from "./dateUtils";
import type { AttendanceRecord, AttendanceStats, Period } from "./types";

/**
 * 指定期間の勤怠統計を計算する。
 * 出社率は「出社日数 / (出社日数 + 在宅日数)」で算出する(有給は含まない)。
 * requiredOfficeDaysは「目標出社率に達するために今後必要な出社日数」を示す。
 *
 * todayStrは呼び出し元(APIハンドラ)が現在日時を注入する(純粋関数としてテスト容易にするため)。
 */
export function calculateStats(
  records: ReadonlyMap<string, AttendanceRecord>,
  period: Period,
  holidays: ReadonlySet<string>,
  companyHolidays: ReadonlySet<string>,
  companyWorkingDays: ReadonlySet<string>,
  targetOfficeRate: number,
  todayStr: string,
): AttendanceStats {
  const businessDays = getBusinessDays(period, holidays, companyHolidays, companyWorkingDays);

  const paidLeaveDays = businessDays.filter(
    (date) => records.get(date)?.status === "paidleave",
  ).length;

  const totalDays = businessDays.length - paidLeaveDays;

  const officeDays = businessDays.filter((date) => records.get(date)?.status === "office").length;
  const remoteDays = businessDays.filter((date) => records.get(date)?.status === "remote").length;

  const officeRate = officeDays + remoteDays > 0 ? officeDays / (officeDays + remoteDays) : 0;

  const remainingDays = businessDays.filter((date) => date > todayStr).length;

  const targetTotalOffice = Math.ceil((totalDays * targetOfficeRate) / 100);
  const requiredOfficeDays = Math.max(0, targetTotalOffice - officeDays);

  return {
    totalDays,
    officeDays,
    remoteDays,
    officeRate,
    remainingDays,
    requiredOfficeDays,
  };
}
