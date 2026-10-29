import { isHoliday } from "@attendance/shared";
import { Hono } from "hono";
import { getAllRecords, getCompanyHolidays, getCompanyWorkingDays, getJapanHolidays } from "../lib/data";
import { requireAccessAuth } from "../middleware/accessAuth";
import { withCalendarOwner } from "../middleware/calendarOwner";
import type { AppEnv } from "../types";

/** YYYY-MM-DD形式かつ実在する日付か(2026-02-30などは不可) */
function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** start〜endの日付を1日ずつ列挙する(両端を含む) */
function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  for (const d = new Date(`${start}T00:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

const exportRoutes = new Hono<AppEnv>();
exportRoutes.use("*", requireAccessAuth, withCalendarOwner);

exportRoutes.get("/", async (c) => {
  const startParam = c.req.query("start");
  const endParam = c.req.query("end");
  if ((startParam && !isValidDate(startParam)) || (endParam && !isValidDate(endParam))) {
    return c.json({ error: "日付はYYYY-MM-DD形式で指定してください" }, 400);
  }
  if (startParam && endParam && startParam > endParam) {
    return c.json({ error: "開始日は終了日以前にしてください" }, 400);
  }

  const owner = c.get("calendarOwnerId");
  const [records, holidays, companyHolidays, companyWorkingDays] = await Promise.all([
    getAllRecords(c.env.DB, owner),
    getJapanHolidays(c.env.DB),
    getCompanyHolidays(c.env.DB, owner),
    getCompanyWorkingDays(c.env.DB, owner),
  ]);

  // 省略された側は記録の最初/最後の日で補う。指定側を越える場合や記録がない場合は指定側の日を使う
  const recordDates = Array.from(records.keys()).sort();
  let start = startParam ?? recordDates[0];
  let end = endParam ?? recordDates.at(-1);
  if (!startParam && end && (!start || start > end)) start = end;
  if (!endParam && start && (!end || end < start)) end = start;
  if (!start || !end) {
    return c.json({ range: null, days: [] });
  }

  const days = eachDate(start, end).map((date) => {
    const record = records.get(date);
    return {
      date,
      isHoliday: isHoliday(date, holidays, companyHolidays, companyWorkingDays),
      record: record ? { status: record.status, updatedAt: record.updatedAt } : null,
    };
  });
  return c.json({ range: { start, end }, days });
});

export { exportRoutes };
