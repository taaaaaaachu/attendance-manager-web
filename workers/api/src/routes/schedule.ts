import { Hono } from "hono";
import { applySchedule } from "../lib/schedule";
import { requireAccessAuth } from "../middleware/accessAuth";
import { withCalendarOwner } from "../middleware/calendarOwner";
import type { AppEnv } from "../types";

const schedule = new Hono<AppEnv>();
schedule.use("*", requireAccessAuth, withCalendarOwner);

schedule.post("/apply", async (c) => {
  const body = await c.req.json<{
    remoteWeekdays?: number[];
    force?: boolean;
    offsetMonths?: number;
  }>();
  const result = await applySchedule(c.env.DB, c.get("calendarOwnerId"), {
    remoteWeekdays: body.remoteWeekdays ?? [],
    force: body.force ?? false,
    offsetMonths: body.offsetMonths ?? 0,
  });
  return c.json(result);
});

export { schedule as scheduleRoutes };
