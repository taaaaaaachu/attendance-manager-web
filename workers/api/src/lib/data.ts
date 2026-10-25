import type { AttendanceRecord, AttendanceStatus, ClosingDayShift, UserSettings } from "@attendance/shared";

export function nowIso(): string {
  return new Date().toISOString();
}

interface UserSettingsRow {
  mandatory_office_day_rules: string;
  target_office_rate: number;
  closing_day: number;
  closing_day_shift: string;
  auto_fetch_holidays: number;
}

export async function getUserSettings(db: D1Database, userId: string): Promise<UserSettings> {
  const row = await db
    .prepare("SELECT * FROM user_settings WHERE user_id = ?")
    .bind(userId)
    .first<UserSettingsRow>();

  if (!row) {
    return {
      mandatoryOfficeDayRules: [],
      targetOfficeRate: 50,
      closingDay: 15,
      closingDayShift: "none",
      autoFetchHolidays: true,
    };
  }

  return {
    mandatoryOfficeDayRules: JSON.parse(row.mandatory_office_day_rules),
    targetOfficeRate: row.target_office_rate,
    closingDay: row.closing_day,
    closingDayShift: row.closing_day_shift as ClosingDayShift,
    autoFetchHolidays: row.auto_fetch_holidays === 1,
  };
}

export async function updateUserSettings(
  db: D1Database,
  userId: string,
  settings: UserSettings,
): Promise<void> {
  // Access認証ではユーザー行の事前作成が無いため、初回保存でも行が作られるようupsertにする
  await db
    .prepare(
      `INSERT INTO user_settings (user_id, mandatory_office_day_rules, target_office_rate, closing_day, closing_day_shift, auto_fetch_holidays, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         mandatory_office_day_rules = excluded.mandatory_office_day_rules,
         target_office_rate = excluded.target_office_rate,
         closing_day = excluded.closing_day,
         closing_day_shift = excluded.closing_day_shift,
         auto_fetch_holidays = excluded.auto_fetch_holidays,
         updated_at = excluded.updated_at`,
    )
    .bind(
      userId,
      JSON.stringify(settings.mandatoryOfficeDayRules),
      settings.targetOfficeRate,
      settings.closingDay,
      settings.closingDayShift,
      settings.autoFetchHolidays ? 1 : 0,
      nowIso(),
    )
    .run();
}

export async function getAllRecords(
  db: D1Database,
  userId: string,
): Promise<Map<string, AttendanceRecord>> {
  const { results } = await db
    .prepare("SELECT date, status, updated_at FROM attendance_records WHERE user_id = ?")
    .bind(userId)
    .all<{ date: string; status: AttendanceStatus; updated_at: string }>();

  const map = new Map<string, AttendanceRecord>();
  for (const row of results) {
    map.set(row.date, { date: row.date, status: row.status, updatedAt: row.updated_at });
  }
  return map;
}

export async function upsertRecord(
  db: D1Database,
  userId: string,
  date: string,
  status: AttendanceStatus,
): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO attendance_records (user_id, date, status, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
    )
    .bind(userId, date, status, now)
    .run();
}

export async function deleteRecord(db: D1Database, userId: string, date: string): Promise<void> {
  await db
    .prepare("DELETE FROM attendance_records WHERE user_id = ? AND date = ?")
    .bind(userId, date)
    .run();
}

export async function deleteRecordsInRange(
  db: D1Database,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM attendance_records WHERE user_id = ? AND date >= ? AND date <= ?")
    .bind(userId, startDate, endDate)
    .run();
}

export async function deleteAllRecords(db: D1Database, userId: string): Promise<void> {
  await db.prepare("DELETE FROM attendance_records WHERE user_id = ?").bind(userId).run();
}

/** 勤怠記録を1件以上持つ全ユーザーのIDを返す(users テーブルが無いためこれを正とする) */
export async function getAllUserIds(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT DISTINCT user_id FROM attendance_records ORDER BY user_id")
    .all<{ user_id: string }>();
  return results.map((r) => r.user_id);
}

async function getDateSet(
  db: D1Database,
  table: "company_holidays" | "company_working_days",
  userId: string,
): Promise<Set<string>> {
  const { results } = await db
    .prepare(`SELECT date FROM ${table} WHERE user_id = ?`)
    .bind(userId)
    .all<{ date: string }>();
  return new Set(results.map((r) => r.date));
}

export function getCompanyHolidays(db: D1Database, userId: string): Promise<Set<string>> {
  return getDateSet(db, "company_holidays", userId);
}

export function getCompanyWorkingDays(db: D1Database, userId: string): Promise<Set<string>> {
  return getDateSet(db, "company_working_days", userId);
}

export async function addCompanyDay(
  db: D1Database,
  table: "company_holidays" | "company_working_days",
  userId: string,
  date: string,
): Promise<void> {
  await db
    .prepare(`INSERT OR IGNORE INTO ${table} (user_id, date) VALUES (?, ?)`)
    .bind(userId, date)
    .run();
}

export async function removeCompanyDay(
  db: D1Database,
  table: "company_holidays" | "company_working_days",
  userId: string,
  date: string,
): Promise<void> {
  await db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND date = ?`).bind(userId, date).run();
}

export async function deleteCompanyDaysInRange(
  db: D1Database,
  table: "company_holidays" | "company_working_days",
  userId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  await db
    .prepare(`DELETE FROM ${table} WHERE user_id = ? AND date >= ? AND date <= ?`)
    .bind(userId, startDate, endDate)
    .run();
}

export async function deleteAllCompanyDays(
  db: D1Database,
  table: "company_holidays" | "company_working_days",
  userId: string,
): Promise<void> {
  await db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId).run();
}

/**
 * 管理者がユーザーを削除する。所有者として連携しているメンバーのデータは
 * 保護し、対象ユーザー自身のデータと関係だけをD1のバッチでまとめて削除する。
 */
export async function deleteUserData(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM attendance_records WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM company_holidays WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM company_working_days WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_settings WHERE user_id = ?").bind(userId),
    // 所有者を削除しても、メンバー側の休眠データは保持する。
    db.prepare("DELETE FROM account_links WHERE owner_email = ? OR member_email = ?").bind(userId, userId),
    db.prepare("DELETE FROM link_requests WHERE requester_email = ? OR target_email = ?").bind(userId, userId),
    // 残すと削除後もエージェントが書き込めてしまうため、発行したエージェント接続も消す(ADR 0004)
    db.prepare("DELETE FROM agent_connections WHERE user_email = ?").bind(userId),
    db.prepare("DELETE FROM oauth_codes WHERE user_email = ?").bind(userId),
  ]);
}

export async function getJapanHolidays(db: D1Database): Promise<Set<string>> {
  const { results } = await db.prepare("SELECT date FROM japan_holidays").all<{ date: string }>();
  return new Set(results.map((r) => r.date));
}

export async function saveJapanHolidays(db: D1Database, dates: string[]): Promise<void> {
  const now = nowIso();
  const statements = dates.map((date) =>
    db
      .prepare("INSERT OR IGNORE INTO japan_holidays (date, fetched_at) VALUES (?, ?)")
      .bind(date, now),
  );
  if (statements.length > 0) {
    await db.batch(statements);
  }
}
