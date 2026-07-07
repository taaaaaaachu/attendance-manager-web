import { Hono } from "hono";
import { getJapanHolidays, saveJapanHolidays } from "../lib/data";
import { requireAccessAuth } from "../middleware/accessAuth";
import type { AppEnv } from "../types";

const CABINET_OFFICE_CSV_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv";

export function parseSlashDate(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** 内閣府CSV(Shift-JIS, 1行目ヘッダー)をパースしてYYYY-MM-DDの配列を返す */
export function parseCabinetOfficeCsv(text: string): string[] {
  const dates: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const [dateStr] = line.split(",");
    const parsed = parseSlashDate(dateStr);
    if (parsed) dates.push(parsed);
  }
  return dates;
}

const holidays = new Hono<AppEnv>();
holidays.use("*", requireAccessAuth);

holidays.get("/", async (c) => {
  const year = c.req.query("year");
  const all = await getJapanHolidays(c.env.DB);
  const list = Array.from(all)
    .filter((d) => !year || d.startsWith(`${year}-`))
    .sort();
  return c.json({ holidays: list });
});

holidays.post("/fetch", async (c) => {
  let response: Response;
  try {
    response = await fetch(CABINET_OFFICE_CSV_URL);
  } catch {
    return c.json({ error: "祝日APIへの接続に失敗しました" }, 502);
  }
  if (!response.ok) {
    return c.json({ error: `祝日APIのステータスコード: ${response.status}` }, 502);
  }

  const buffer = await response.arrayBuffer();
  const text = new TextDecoder("shift-jis").decode(buffer);
  const dates = parseCabinetOfficeCsv(text);

  await saveJapanHolidays(c.env.DB, dates);
  return c.json({ count: dates.length });
});

export { holidays as holidayRoutes };
