import { formatDate, getPeriodForMonthOffset } from "@attendance/shared";
import { Hono } from "hono";
import {
  deleteAllCompanyDays,
  deleteAllRecords,
  deleteCompanyDaysInRange,
  deleteRecordsInRange,
  getCompanyHolidays,
  getCompanyWorkingDays,
  getJapanHolidays,
  getUserSettings,
} from "../lib/data";
import { requireAccessAuth } from "../middleware/accessAuth";
import type { AppEnv } from "../types";

const attendance = new Hono<AppEnv>();
attendance.use("*", requireAccessAuth);

attendance.post("/reset", async (c) => {
  const body = await c.req.json<{ scope?: "period" | "all"; offsetMonths?: number }>();
  const userId = c.get("userId");

  if (body.scope === "all") {
    await deleteAllRecords(c.env.DB, userId);
    await deleteAllCompanyDays(c.env.DB, "company_holidays", userId);
    await deleteAllCompanyDays(c.env.DB, "company_working_days", userId);
    return c.json({ ok: true, scope: "all" });
  }

  const settings = await getUserSettings(c.env.DB, userId);
  const [companyHolidays, companyWorkingDays, japanHolidays] = await Promise.all([
    getCompanyHolidays(c.env.DB, userId),
    getCompanyWorkingDays(c.env.DB, userId),
    getJapanHolidays(c.env.DB),
  ]);
  const today = formatDate(new Date());
  const period = getPeriodForMonthOffset(
    today,
    body.offsetMonths ?? 0,
    settings.closingDay,
    settings.closingDayShift,
    japanHolidays,
    companyHolidays,
    companyWorkingDays,
  );

  await deleteRecordsInRange(c.env.DB, userId, period.startDate, period.endDate);
  await deleteCompanyDaysInRange(c.env.DB, "company_holidays", userId, period.startDate, period.endDate);
  await deleteCompanyDaysInRange(c.env.DB, "company_working_days", userId, period.startDate, period.endDate);

  return c.json({ ok: true, scope: "period", period });
});

export { attendance as attendanceRoutes };
