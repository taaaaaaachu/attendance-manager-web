import { addDays, addMonths, format, getDay, parseISO } from "date-fns";
import type { ClosingDayShift, Period } from "./types";

const DATE_FORMAT = "yyyy-MM-dd";

export function formatDate(date: Date): string {
  return format(date, DATE_FORMAT);
}

export function parseDate(dateStr: string): Date {
  return parseISO(dateStr);
}

function addDaysStr(dateStr: string, amount: number): string {
  return formatDate(addDays(parseDate(dateStr), amount));
}

function daysInMonth(year: number, month: number): number {
  // month: 1-12。month番目の月の末日を取得する(Dateのmonth引数は0始まりなので、
  // そのままmonthを渡すと翌月扱いになり、day=0で前日=当月末日が得られる)。
  return new Date(year, month, 0).getDate();
}

function lastDayOfMonthStr(year: number, month: number): string {
  return format(new Date(year, month, 0), DATE_FORMAT);
}

/**
 * 指定した年月の締め日(カレンダー上の日付)を返す。
 * closingDay=0は月末、1〜31はその日(存在しない場合は月末にフォールバック)。
 */
export function resolveClosingDate(year: number, month: number, closingDay: number): string {
  if (closingDay === 0) {
    return lastDayOfMonthStr(year, month);
  }
  if (closingDay > daysInMonth(year, month)) {
    return lastDayOfMonthStr(year, month);
  }
  return format(new Date(year, month - 1, closingDay), DATE_FORMAT);
}

/**
 * 指定日が「もともと休日」(土日または国民の祝日)かどうかを判定する。
 * 会社休日・会社営業日の設定は考慮しない。
 */
export function isBaseHoliday(dateStr: string, holidays: ReadonlySet<string>): boolean {
  const weekday = getDay(parseDate(dateStr)); // 0=Sun, 6=Sat
  return weekday === 0 || weekday === 6 || holidays.has(dateStr);
}

/**
 * 指定日が休日かどうかを判定する。
 * 1. companyWorkingDaysに含まれていれば → 営業日(休日ではない)
 * 2. 土日、国民の祝日、会社休日のいずれかなら → 休日
 */
export function isHoliday(
  dateStr: string,
  holidays: ReadonlySet<string>,
  companyHolidays: ReadonlySet<string>,
  companyWorkingDays: ReadonlySet<string>,
): boolean {
  if (companyWorkingDays.has(dateStr)) {
    return false;
  }
  return isBaseHoliday(dateStr, holidays) || companyHolidays.has(dateStr);
}

/**
 * 締め日に休日シフトを適用する。
 * previous: 締め日が休日なら、営業日が見つかるまで前日方向にずらす。
 * next: 締め日が休日なら、営業日が見つかるまで翌日方向にずらす。
 * none: そのまま返す。
 */
export function applyClosingDayShift(
  dateStr: string,
  shift: ClosingDayShift,
  holidays: ReadonlySet<string>,
  companyHolidays: ReadonlySet<string>,
  companyWorkingDays: ReadonlySet<string>,
): string {
  if (shift === "none") {
    return dateStr;
  }
  const step = shift === "previous" ? -1 : 1;
  let current = dateStr;
  while (isHoliday(current, holidays, companyHolidays, companyWorkingDays)) {
    current = addDaysStr(current, step);
  }
  return current;
}

/**
 * 指定日が休日の場合、翌営業日まで日付を進めて返す。
 */
export function adjustStartDateForBusinessDay(
  dateStr: string,
  holidays: ReadonlySet<string>,
  companyHolidays: ReadonlySet<string>,
  companyWorkingDays: ReadonlySet<string>,
): string {
  let current = dateStr;
  while (isHoliday(current, holidays, companyHolidays, companyWorkingDays)) {
    current = addDaysStr(current, 1);
  }
  return current;
}

function prevYearMonth(year: number, month: number): [number, number] {
  return month === 1 ? [year - 1, 12] : [year, month - 1];
}

function nextYearMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1];
}

/**
 * 指定日(todayStr)が属する勤怠期間を算出する。
 * 例: 締め日=15, シフト=none, today=2026-02-20 → 期間は2026-02-16〜2026-03-15
 */
export function getCurrentPeriod(
  todayStr: string,
  closingDay: number,
  closingDayShift: ClosingDayShift,
  holidays: ReadonlySet<string>,
  companyHolidays: ReadonlySet<string>,
  companyWorkingDays: ReadonlySet<string>,
): Period {
  const today = parseDate(todayStr);
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const candidateEnd = resolveClosingDate(year, month, closingDay);
  const shiftedEnd = applyClosingDayShift(
    candidateEnd,
    closingDayShift,
    holidays,
    companyHolidays,
    companyWorkingDays,
  );

  if (todayStr <= shiftedEnd) {
    const [py, pm] = prevYearMonth(year, month);
    const prevClosing = resolveClosingDate(py, pm, closingDay);
    const prevShifted = applyClosingDayShift(
      prevClosing,
      closingDayShift,
      holidays,
      companyHolidays,
      companyWorkingDays,
    );
    return { startDate: addDaysStr(prevShifted, 1), endDate: shiftedEnd };
  }

  const [ny, nm] = nextYearMonth(year, month);
  const nextClosing = resolveClosingDate(ny, nm, closingDay);
  const nextShifted = applyClosingDayShift(
    nextClosing,
    closingDayShift,
    holidays,
    companyHolidays,
    companyWorkingDays,
  );
  return { startDate: addDaysStr(shiftedEnd, 1), endDate: nextShifted };
}

/**
 * 指定期間内の全員出社日を算出する。
 * rulesで指定された日(例: [1, 16])が期間内にあれば対象とし、休日なら翌営業日にずらす。
 */
export function getMandatoryOfficeDays(
  period: Period,
  holidays: ReadonlySet<string>,
  companyHolidays: ReadonlySet<string>,
  companyWorkingDays: ReadonlySet<string>,
  rules: readonly number[],
): string[] {
  const result = new Set<string>();
  const start = parseDate(period.startDate);
  const end = parseDate(period.endDate);
  let year = start.getFullYear();
  let month = start.getMonth() + 1;
  const endYear = end.getFullYear();
  const endMonth = end.getMonth() + 1;

  while (true) {
    for (const day of rules) {
      if (day >= 1 && day <= daysInMonth(year, month)) {
        const dateStr = format(new Date(year, month - 1, day), DATE_FORMAT);
        if (dateStr >= period.startDate && dateStr <= period.endDate) {
          const adjusted = adjustStartDateForBusinessDay(
            dateStr,
            holidays,
            companyHolidays,
            companyWorkingDays,
          );
          if (adjusted >= period.startDate && adjusted <= period.endDate) {
            result.add(adjusted);
          }
        }
      }
    }

    if (year === endYear && month === endMonth) {
      break;
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return Array.from(result).sort();
}

/**
 * offsetMonths分だけ基準日(todayStr)をずらした上で、その月が属する勤怠期間を算出する。
 * カレンダー画面の「前月/翌月」ナビゲーションに使う。
 */
export function getPeriodForMonthOffset(
  todayStr: string,
  offsetMonths: number,
  closingDay: number,
  closingDayShift: ClosingDayShift,
  holidays: ReadonlySet<string>,
  companyHolidays: ReadonlySet<string>,
  companyWorkingDays: ReadonlySet<string>,
): Period {
  const shiftedToday = formatDate(addMonths(parseDate(todayStr), offsetMonths));
  return getCurrentPeriod(
    shiftedToday,
    closingDay,
    closingDayShift,
    holidays,
    companyHolidays,
    companyWorkingDays,
  );
}

/** 指定日の曜日を返す(0=日曜〜6=土曜) */
export function getWeekday(dateStr: string): number {
  return getDay(parseDate(dateStr));
}

/**
 * 指定期間内の営業日(休日を除いた日)のリストを返す。
 * 期間開始日が休日の場合は翌営業日から開始する。
 */
export function getBusinessDays(
  period: Period,
  holidays: ReadonlySet<string>,
  companyHolidays: ReadonlySet<string>,
  companyWorkingDays: ReadonlySet<string>,
): string[] {
  const days: string[] = [];
  let current = adjustStartDateForBusinessDay(
    period.startDate,
    holidays,
    companyHolidays,
    companyWorkingDays,
  );

  while (current <= period.endDate) {
    if (!isHoliday(current, holidays, companyHolidays, companyWorkingDays)) {
      days.push(current);
    }
    current = addDaysStr(current, 1);
  }
  return days;
}
