import type { AttendanceRecord, AttendanceStatus } from "@attendance/shared";
import { calculateStats, formatDate, getBusinessDays, getPeriodForMonthOffset, getWeekday } from "@attendance/shared";
import { Hono } from "hono";
import {
  getAllRecords,
  getCompanyHolidays,
  getCompanyWorkingDays,
  getJapanHolidays,
  getUserSettings,
  upsertRecord,
} from "../lib/data";
import { requireAccessAuth } from "../middleware/accessAuth";
import type { AppEnv } from "../types";

const schedule = new Hono<AppEnv>();
schedule.use("*", requireAccessAuth);

schedule.post("/apply", async (c) => {
  const body = await c.req.json<{
    remoteWeekdays?: number[];
    force?: boolean;
    offsetMonths?: number;
  }>();
  const remoteWeekdays = new Set(body.remoteWeekdays ?? []);
  const offsetMonths = body.offsetMonths ?? 0;
  const userId = c.get("userId");

  const settings = await getUserSettings(c.env.DB, userId);
  const [companyHolidays, companyWorkingDays, japanHolidays, existingRecords] = await Promise.all([
    getCompanyHolidays(c.env.DB, userId),
    getCompanyWorkingDays(c.env.DB, userId),
    getJapanHolidays(c.env.DB),
    getAllRecords(c.env.DB, userId),
  ]);

  const today = formatDate(new Date());
  const period = getPeriodForMonthOffset(
    today,
    offsetMonths,
    settings.closingDay,
    settings.closingDayShift,
    japanHolidays,
    companyHolidays,
    companyWorkingDays,
  );
  const businessDays = getBusinessDays(period, japanHolidays, companyHolidays, companyWorkingDays);

  // 既に有給休暇が設定されている日は上書きしない
  const plannedStatuses = new Map<string, AttendanceStatus>();
  for (const date of businessDays) {
    if (existingRecords.get(date)?.status === "paidleave") continue;
    plannedStatuses.set(date, remoteWeekdays.has(getWeekday(date)) ? "remote" : "office");
  }

  const simulatedRecords = new Map<string, AttendanceRecord>(existingRecords);
  for (const [date, status] of plannedStatuses) {
    simulatedRecords.set(date, { date, status });
  }

  const stats = calculateStats(
    simulatedRecords,
    period,
    japanHolidays,
    companyHolidays,
    companyWorkingDays,
    settings.targetOfficeRate,
    today,
  );

  if (!body.force && stats.officeRate * 100 < settings.targetOfficeRate) {
    return c.json({ applied: false, warning: true, stats, period });
  }

  for (const [date, status] of plannedStatuses) {
    await upsertRecord(c.env.DB, userId, date, status);
  }

  return c.json({ applied: true, warning: false, stats, period });
});

export { schedule as scheduleRoutes };
