import { apiFetch } from "./client";

export async function getHolidays(year?: number): Promise<string[]> {
  const { holidays } = await apiFetch<{ holidays: string[] }>(
    `/holidays${year ? `?year=${year}` : ""}`,
  );
  return holidays;
}

export function fetchHolidaysFromCabinetOffice(): Promise<{ count: number }> {
  return apiFetch("/holidays/fetch", { method: "POST" });
}
