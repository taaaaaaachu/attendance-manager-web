import { apiFetch } from "./client";

async function list(basePath: string): Promise<string[]> {
  const { dates } = await apiFetch<{ dates: string[] }>(basePath);
  return dates;
}

function add(basePath: string, date: string): Promise<{ date: string }> {
  return apiFetch(basePath, { method: "POST", body: JSON.stringify({ date }) });
}

function remove(basePath: string, date: string): Promise<{ ok: boolean }> {
  return apiFetch(`${basePath}/${date}`, { method: "DELETE" });
}

export const getCompanyHolidays = () => list("/company-holidays");
export const addCompanyHoliday = (date: string) => add("/company-holidays", date);
export const removeCompanyHoliday = (date: string) => remove("/company-holidays", date);

export const getCompanyWorkingDays = () => list("/company-working-days");
export const addCompanyWorkingDay = (date: string) => add("/company-working-days", date);
export const removeCompanyWorkingDay = (date: string) => remove("/company-working-days", date);
