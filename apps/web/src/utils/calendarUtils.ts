import type { AttendanceRecord, AttendanceStatus } from "@attendance/shared";
import { formatDate, isHoliday } from "@attendance/shared";

export const STATUS_EMOJI: Record<AttendanceStatus, string> = {
  office: "🏢",
  remote: "🏠",
  paidleave: "🌴",
};

export function getTileClassName(params: {
  date: Date;
  period: { startDate: string; endDate: string };
  records: Map<string, AttendanceRecord>;
  holidays: ReadonlySet<string>;
  companyHolidays: ReadonlySet<string>;
  companyWorkingDays: ReadonlySet<string>;
}): string {
  const dateStr = formatDate(params.date);
  if (dateStr < params.period.startDate || dateStr > params.period.endDate) {
    return "tile-disabled";
  }

  const record = params.records.get(dateStr);
  if (record?.status === "office") return "tile-office";
  if (record?.status === "remote") return "tile-remote";
  if (record?.status === "paidleave") return "tile-paidleave";

  if (isHoliday(dateStr, params.holidays, params.companyHolidays, params.companyWorkingDays)) {
    return "tile-holiday";
  }
  return "";
}
