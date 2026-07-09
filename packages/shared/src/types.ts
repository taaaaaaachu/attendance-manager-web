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

// 管理者画面: 全ユーザー一覧の各行(ユーザー自身の締め日設定に基づく現在の期間で集計)
export interface AdminUserSummary {
  userId: string;
  closingDay: number;
  closingDayShift: ClosingDayShift;
  targetOfficeRate: number;
  period: Period;
  stats: AttendanceStats;
}

// 管理者画面: 特定ユーザーのドリルダウン(読み取り専用の記録閲覧用)
export interface AdminUserDetail {
  userId: string;
  period: Period;
  records: AttendanceRecord[];
  companyHolidays: string[];
  companyWorkingDays: string[];
  settings: UserSettings;
  stats: AttendanceStats;
}
