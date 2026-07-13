import { Hono } from "hono";
import { addCompanyDay, getCompanyHolidays, getCompanyWorkingDays, removeCompanyDay } from "../lib/data";
import { requireAccessAuth } from "../middleware/accessAuth";
import { withCalendarOwner } from "../middleware/calendarOwner";
import type { AppEnv } from "../types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function buildCompanyDayRoutes(table: "company_holidays" | "company_working_days") {
  const router = new Hono<AppEnv>();
  router.use("*", requireAccessAuth, withCalendarOwner);
  const getSet = table === "company_holidays" ? getCompanyHolidays : getCompanyWorkingDays;

  router.get("/", async (c) => {
    const dates = await getSet(c.env.DB, c.get("calendarOwnerId"));
    return c.json({ dates: Array.from(dates).sort() });
  });

  router.post("/", async (c) => {
    const body = await c.req.json<{ date?: string }>();
    if (!body.date || !DATE_PATTERN.test(body.date)) {
      return c.json({ error: "日付はYYYY-MM-DD形式で指定してください" }, 400);
    }
    await addCompanyDay(c.env.DB, table, c.get("calendarOwnerId"), body.date);
    return c.json({ date: body.date }, 201);
  });

  router.delete("/:date", async (c) => {
    const date = c.req.param("date");
    if (!DATE_PATTERN.test(date)) {
      return c.json({ error: "日付はYYYY-MM-DD形式で指定してください" }, 400);
    }
    await removeCompanyDay(c.env.DB, table, c.get("calendarOwnerId"), date);
    return c.json({ ok: true });
  });

  return router;
}

export const companyHolidayRoutes = buildCompanyDayRoutes("company_holidays");
export const companyWorkingDayRoutes = buildCompanyDayRoutes("company_working_days");
