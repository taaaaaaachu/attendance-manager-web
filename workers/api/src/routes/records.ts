import type { AttendanceStatus } from "@attendance/shared";
import { calculateStats, formatDate, getPeriodForMonthOffset } from "@attendance/shared";
import { Hono } from "hono";
import {
  deleteRecord,
  getAllRecords,
  getCompanyHolidays,
  getCompanyWorkingDays,
  getJapanHolidays,
  getUserSettings,
  upsertRecord,
} from "../lib/data";
import { requireAccessAuth } from "../middleware/accessAuth";
import type { AppEnv } from "../types";

const VALID_STATUSES: AttendanceStatus[] = ["office", "remote", "paidleave"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const records = new Hono<AppEnv>();
records.use("*", requireAccessAuth);

function parseOffsetMonths(value: string | undefined): number {
  const n = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(n) ? n : 0;
}

records.get("/records", async (c) => {
  const userId = c.get("userId");
  const all = await getAllRecords(c.env.DB, userId);
  const start = c.req.query("start");
  const end = c.req.query("end");

  const list = Array.from(all.values())
    .filter((r) => (!start || r.date >= start) && (!end || r.date <= end))
    .sort((a, b) => a.date.localeCompare(b.date));

  return c.json({ records: list });
});

records.put("/records/:date", async (c) => {
  const date = c.req.param("date");
  if (!DATE_PATTERN.test(date)) {
    return c.json({ error: "日付はYYYY-MM-DD形式で指定してください" }, 400);
  }
  const body = await c.req.json<{ status?: string }>();
  if (!body.status || !VALID_STATUSES.includes(body.status as AttendanceStatus)) {
    return c.json({ error: `statusは${VALID_STATUSES.join("/")}のいずれかにしてください` }, 400);
  }

  await upsertRecord(c.env.DB, c.get("userId"), date, body.status as AttendanceStatus);
  return c.json({ date, status: body.status });
});

records.delete("/records/:date", async (c) => {
  const date = c.req.param("date");
  if (!DATE_PATTERN.test(date)) {
    return c.json({ error: "日付はYYYY-MM-DD形式で指定してください" }, 400);
  }
  await deleteRecord(c.env.DB, c.get("userId"), date);
  return c.json({ ok: true });
});

async function loadPeriodContext(db: D1Database, userId: string, offsetMonths: number) {
  const settings = await getUserSettings(db, userId);
  const [companyHolidays, companyWorkingDays, japanHolidays] = await Promise.all([
    getCompanyHolidays(db, userId),
    getCompanyWorkingDays(db, userId),
    getJapanHolidays(db),
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
  return { settings, companyHolidays, companyWorkingDays, japanHolidays, today, period };
}

records.get("/period", async (c) => {
  const offsetMonths = parseOffsetMonths(c.req.query("offsetMonths"));
  const { period } = await loadPeriodContext(c.env.DB, c.get("userId"), offsetMonths);
  return c.json(period);
});

records.get("/stats", async (c) => {
  const userId = c.get("userId");
  const offsetMonths = parseOffsetMonths(c.req.query("offsetMonths"));
  const { settings, companyHolidays, companyWorkingDays, japanHolidays, today, period } =
    await loadPeriodContext(c.env.DB, userId, offsetMonths);
  const allRecords = await getAllRecords(c.env.DB, userId);

  const stats = calculateStats(
    allRecords,
    period,
    japanHolidays,
    companyHolidays,
    companyWorkingDays,
    settings.targetOfficeRate,
    today,
  );

  return c.json(stats);
});

export { records as recordRoutes };
