import type { ClosingDayShift } from "@attendance/shared";
import { Hono } from "hono";
import { getUserSettings, updateUserSettings } from "../lib/data";
import { requireAccessAuth } from "../middleware/accessAuth";
import type { AppEnv } from "../types";

const CLOSING_DAY_SHIFTS: ClosingDayShift[] = ["none", "previous", "next"];

const settings = new Hono<AppEnv>();
settings.use("*", requireAccessAuth);

settings.get("/settings", async (c) => {
  const current = await getUserSettings(c.env.DB, c.get("userId"));
  return c.json(current);
});

settings.put("/settings", async (c) => {
  const body = await c.req.json<{
    mandatoryOfficeDayRules?: number[];
    targetOfficeRate?: number;
    closingDay?: number;
    closingDayShift?: string;
    autoFetchHolidays?: boolean;
  }>();

  const current = await getUserSettings(c.env.DB, c.get("userId"));

  if (body.mandatoryOfficeDayRules !== undefined) {
    if (
      !Array.isArray(body.mandatoryOfficeDayRules) ||
      body.mandatoryOfficeDayRules.some((d) => !Number.isInteger(d) || d < 1 || d > 31)
    ) {
      return c.json({ error: "mandatoryOfficeDayRulesは1〜31の整数の配列にしてください" }, 400);
    }
  }
  if (body.targetOfficeRate !== undefined && (body.targetOfficeRate < 0 || body.targetOfficeRate > 100)) {
    return c.json({ error: "targetOfficeRateは0〜100にしてください" }, 400);
  }
  if (body.closingDay !== undefined && (body.closingDay < 0 || body.closingDay > 31)) {
    return c.json({ error: "closingDayは0〜31にしてください" }, 400);
  }
  if (body.closingDayShift !== undefined && !CLOSING_DAY_SHIFTS.includes(body.closingDayShift as ClosingDayShift)) {
    return c.json({ error: `closingDayShiftは${CLOSING_DAY_SHIFTS.join("/")}のいずれかにしてください` }, 400);
  }

  const updated = {
    mandatoryOfficeDayRules: body.mandatoryOfficeDayRules ?? current.mandatoryOfficeDayRules,
    targetOfficeRate: body.targetOfficeRate ?? current.targetOfficeRate,
    closingDay: body.closingDay ?? current.closingDay,
    closingDayShift: (body.closingDayShift as ClosingDayShift) ?? current.closingDayShift,
    autoFetchHolidays: body.autoFetchHolidays ?? current.autoFetchHolidays,
  };

  await updateUserSettings(c.env.DB, c.get("userId"), updated);
  return c.json(updated);
});

export { settings as settingsRoutes };
