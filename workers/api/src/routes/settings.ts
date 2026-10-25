import { Hono } from "hono";
import { getUserSettings } from "../lib/data";
import { patchUserSettings, type SettingsPatch } from "../lib/settings";
import { requireAccessAuth } from "../middleware/accessAuth";
import { withCalendarOwner } from "../middleware/calendarOwner";
import type { AppEnv } from "../types";

const settings = new Hono<AppEnv>();
settings.use("*", requireAccessAuth, withCalendarOwner);

settings.get("/settings", async (c) => {
  const current = await getUserSettings(c.env.DB, c.get("calendarOwnerId"));
  return c.json(current);
});

settings.put("/settings", async (c) => {
  const body = await c.req.json<SettingsPatch>();
  const result = await patchUserSettings(c.env.DB, c.get("calendarOwnerId"), body);
  if ("error" in result) return c.json({ error: result.error }, 400);
  return c.json(result.settings);
});

export { settings as settingsRoutes };
