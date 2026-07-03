export type AttendanceStatus = "office" | "remote" | "paidleave";

export interface AttendanceRecord {
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  updatedAt?: string; // ISO 8601
}

export interface Period {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export type ClosingDayShift = "none" | "previous" | "next";

export interface AttendanceStats {
  totalDays: number; // 有給を除いた営業日数
  officeDays: number;
  remoteDays: number;
  officeRate: number; // 出社 / (出社 + 在宅)
  remainingDays: number; // 今日以降の残り営業日数
  requiredOfficeDays: number; // 目標達成に必要な残り出社日数
}

export interface UserSettings {
  mandatoryOfficeDayRules: number[]; // 例: [1, 16]
  targetOfficeRate: number; // %
  closingDay: number; // 0 = 月末, 1-31 = 指定日
  closingDayShift: ClosingDayShift;
  autoFetchHolidays: boolean;
}
