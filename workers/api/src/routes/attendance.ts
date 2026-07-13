import { Hono } from "hono";
import {
  deleteAllCompanyDays,
  deleteAllRecords,
  deleteCompanyDaysInRange,
  deleteRecordsInRange,
} from "../lib/data";
import { loadPeriodContext } from "../lib/period";
import { requireAccessAuth } from "../middleware/accessAuth";
import { withCalendarOwner } from "../middleware/calendarOwner";
import type { AppEnv } from "../types";

const attendance = new Hono<AppEnv>();
attendance.use("*", requireAccessAuth, withCalendarOwner);

attendance.post("/reset", async (c) => {
  const body = await c.req.json<{ scope?: "period" | "all"; offsetMonths?: number }>();
  const userId = c.get("calendarOwnerId");

  if (body.scope === "all") {
    await deleteAllRecords(c.env.DB, userId);
    await deleteAllCompanyDays(c.env.DB, "company_holidays", userId);
    await deleteAllCompanyDays(c.env.DB, "company_working_days", userId);
    return c.json({ ok: true, scope: "all" });
  }

  const { period } = await loadPeriodContext(c.env.DB, userId, body.offsetMonths ?? 0);

  await deleteRecordsInRange(c.env.DB, userId, period.startDate, period.endDate);
  await deleteCompanyDaysInRange(c.env.DB, "company_holidays", userId, period.startDate, period.endDate);
  await deleteCompanyDaysInRange(c.env.DB, "company_working_days", userId, period.startDate, period.endDate);

  return c.json({ ok: true, scope: "period", period });
});

export { attendance as attendanceRoutes };
