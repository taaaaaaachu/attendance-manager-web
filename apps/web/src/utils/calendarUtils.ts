import type { AttendanceRecord, AttendanceStatus } from "@attendance/shared";
import { formatDate, isHoliday } from "@attendance/shared";

export const STATUS_EMOJI: Record<AttendanceStatus, string> = {
  office: "🏢",
  remote: "🏠",
  paidleave: "🌴",
};

export function isTodayDate(dateStr: string, today: Date = new Date()): boolean {
  return dateStr === formatDate(today);
}

/** カレンダーセルクリック時の次のステータスを返す(出社⇆在宅のトグル)。 */
export function getNextClickStatus(current: AttendanceStatus | undefined): AttendanceStatus {
  return current === "office" ? "remote" : "office";
}

export function getTileClassName(params: {
  date: Date;
  period: { startDate: string; endDate: string };
  records: Map<string, AttendanceRecord>;
  holidays: ReadonlySet<string>;
  companyHolidays: ReadonlySet<string>;
  companyWorkingDays: ReadonlySet<string>;
}): string {
  const dateStr = formatDate(params.date);
  const todayClass = isTodayDate(dateStr) ? " tile-today" : "";

  if (dateStr < params.period.startDate || dateStr > params.period.endDate) {
    return `tile-disabled${todayClass}`;
  }

  const record = params.records.get(dateStr);
  if (record?.status === "office") return `tile-office${todayClass}`;
  if (record?.status === "remote") return `tile-remote${todayClass}`;
  if (record?.status === "paidleave") return `tile-paidleave${todayClass}`;

  if (isHoliday(dateStr, params.holidays, params.companyHolidays, params.companyWorkingDays)) {
    return `tile-holiday${todayClass}`;
  }
  return todayClass.trim();
}
