import { Hono } from "hono";
import { getAllRecords } from "../lib/data";
import { requireAccessAuth } from "../middleware/accessAuth";
import type { AppEnv } from "../types";

const exportRoutes = new Hono<AppEnv>();
exportRoutes.use("*", requireAccessAuth);

exportRoutes.get("/", async (c) => {
  const start = c.req.query("start");
  const end = c.req.query("end");
  const all = await getAllRecords(c.env.DB, c.get("userId"));
  const records = Array.from(all.values())
    .filter((r) => (!start || r.date >= start) && (!end || r.date <= end))
    .sort((a, b) => a.date.localeCompare(b.date));

  return c.json({ range: { start: start ?? null, end: end ?? null }, records });
});

export { exportRoutes };
