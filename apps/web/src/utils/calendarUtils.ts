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
  const isHolidayDate = isHoliday(dateStr, params.holidays, params.companyHolidays, params.companyWorkingDays);

  if (dateStr < params.period.startDate || dateStr > params.period.endDate) {
    const holidayClass = isHolidayDate ? " tile-holiday" : "";
    return `tile-disabled${holidayClass}${todayClass}`;
  }

  const record = params.records.get(dateStr);
  if (record?.status === "office") return `tile-office${todayClass}`;
  if (record?.status === "remote") return `tile-remote${todayClass}`;
  if (record?.status === "paidleave") return `tile-paidleave${todayClass}`;

  if (isHolidayDate) {
    return `tile-holiday${todayClass}`;
  }
  return todayClass.trim();
}
