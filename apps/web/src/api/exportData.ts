import type { AttendanceRecord } from "@attendance/shared";
import { apiFetch } from "./client";

export interface ExportDay {
  date: string;
  isHoliday: boolean;
  record: Pick<AttendanceRecord, "status" | "updatedAt"> | null;
}

export interface ExportResult {
  range: { start: string; end: string } | null;
  days: ExportDay[];
}

export function exportRecords(range?: { start?: string; end?: string }): Promise<ExportResult> {
  const params = new URLSearchParams();
  if (range?.start) params.set("start", range.start);
  if (range?.end) params.set("end", range.end);
  const query = params.toString();
  return apiFetch(`/export${query ? `?${query}` : ""}`);
}
