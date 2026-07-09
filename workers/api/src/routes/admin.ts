import { Hono } from "hono";
import { getAllRecords, getAllUserIds } from "../lib/data";
import { loadStatsForUser } from "../lib/period";
import { requireAccessAuth } from "../middleware/accessAuth";
import { requireAdmin } from "../middleware/adminAuth";
import type { AppEnv } from "../types";

const admin = new Hono<AppEnv>();
admin.use("*", requireAccessAuth, requireAdmin);

function parseOffsetMonths(value: string | undefined): number {
  const n = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(n) ? n : 0;
}

admin.get("/users", async (c) => {
  const offsetMonths = parseOffsetMonths(c.req.query("offsetMonths"));
  const userIds = await getAllUserIds(c.env.DB);

  const users = await Promise.all(
    userIds.map(async (userId) => {
      const { context, stats } = await loadStatsForUser(c.env.DB, userId, offsetMonths);
      return {
        userId,
        closingDay: context.settings.closingDay,
        closingDayShift: context.settings.closingDayShift,
        targetOfficeRate: context.settings.targetOfficeRate,
        period: context.period,
        stats,
      };
    }),
  );

  return c.json({ users });
});

admin.get("/users/:email/records", async (c) => {
  const userId = c.req.param("email").toLowerCase();
  const offsetMonths = parseOffsetMonths(c.req.query("offsetMonths"));

  const userIds = await getAllUserIds(c.env.DB);
  if (!userIds.includes(userId)) {
    return c.json({ error: "指定されたユーザーが見つかりません" }, 404);
  }

  const [{ context, stats }, records] = await Promise.all([
    loadStatsForUser(c.env.DB, userId, offsetMonths),
    getAllRecords(c.env.DB, userId),
  ]);

  return c.json({
    userId,
    period: context.period,
    records: Array.from(records.values()).sort((a, b) => a.date.localeCompare(b.date)),
    companyHolidays: Array.from(context.companyHolidays),
    companyWorkingDays: Array.from(context.companyWorkingDays),
    settings: context.settings,
    stats,
  });
});

export { admin as adminRoutes };
