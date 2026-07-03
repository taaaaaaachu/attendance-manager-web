import type { AttendanceStats, Period } from "@attendance/shared";
import { apiFetch } from "./client";

export interface ApplyScheduleResult {
  applied: boolean;
  warning: boolean;
  stats: AttendanceStats;
  period: Period;
}

export function applySchedule(params: {
  remoteWeekdays: number[];
  force?: boolean;
  offsetMonths?: number;
}): Promise<ApplyScheduleResult> {
  return apiFetch("/schedule/apply", { method: "POST", body: JSON.stringify(params) });
}
