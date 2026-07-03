import type { AttendanceRecord, AttendanceStats, AttendanceStatus, Period } from "@attendance/shared";
import { apiFetch } from "./client";

export async function getRecords(range?: { start?: string; end?: string }): Promise<AttendanceRecord[]> {
  const params = new URLSearchParams();
  if (range?.start) params.set("start", range.start);
  if (range?.end) params.set("end", range.end);
  const query = params.toString();
  const { records } = await apiFetch<{ records: AttendanceRecord[] }>(
    `/records${query ? `?${query}` : ""}`,
  );
  return records;
}

export function setAttendance(date: string, status: AttendanceStatus): Promise<{ date: string; status: string }> {
  return apiFetch(`/records/${date}`, { method: "PUT", body: JSON.stringify({ status }) });
}

export function deleteAttendance(date: string): Promise<{ ok: boolean }> {
  return apiFetch(`/records/${date}`, { method: "DELETE" });
}

export function getPeriod(offsetMonths = 0): Promise<Period> {
  return apiFetch(`/period?offsetMonths=${offsetMonths}`);
}

export function getStats(offsetMonths = 0): Promise<AttendanceStats> {
  return apiFetch(`/stats?offsetMonths=${offsetMonths}`);
}
