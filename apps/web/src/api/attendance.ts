import { apiFetch } from "./client";

export function resetAttendance(params: { scope: "period" | "all"; offsetMonths?: number }): Promise<{ ok: boolean }> {
  return apiFetch("/attendance/reset", { method: "POST", body: JSON.stringify(params) });
}
