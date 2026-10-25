import type { ClosingDayShift, UserSettings } from "@attendance/shared";
import { getUserSettings, updateUserSettings } from "./data";

export const CLOSING_DAY_SHIFTS: ClosingDayShift[] = ["none", "previous", "next"];

export interface SettingsPatch {
  mandatoryOfficeDayRules?: number[];
  targetOfficeRate?: number;
  closingDay?: number;
  closingDayShift?: string;
  autoFetchHolidays?: boolean;
}

/** 渡した項目だけ設定を変える。画面のAPIとMCPの両方から使う。不正な値ならエラーメッセージを返す */
export async function patchUserSettings(
  db: D1Database,
  userId: string,
  patch: SettingsPatch,
): Promise<{ settings: UserSettings } | { error: string }> {
  if (patch.mandatoryOfficeDayRules !== undefined) {
    if (
      !Array.isArray(patch.mandatoryOfficeDayRules) ||
      patch.mandatoryOfficeDayRules.some((d) => !Number.isInteger(d) || d < 1 || d > 31)
    ) {
      return { error: "mandatoryOfficeDayRulesは1〜31の整数の配列にしてください" };
    }
  }
  if (patch.targetOfficeRate !== undefined && (patch.targetOfficeRate < 0 || patch.targetOfficeRate > 100)) {
    return { error: "targetOfficeRateは0〜100にしてください" };
  }
  if (patch.closingDay !== undefined && (patch.closingDay < 0 || patch.closingDay > 31)) {
    return { error: "closingDayは0〜31にしてください" };
  }
  if (patch.closingDayShift !== undefined && !CLOSING_DAY_SHIFTS.includes(patch.closingDayShift as ClosingDayShift)) {
    return { error: `closingDayShiftは${CLOSING_DAY_SHIFTS.join("/")}のいずれかにしてください` };
  }

  const current = await getUserSettings(db, userId);
  const settings: UserSettings = {
    mandatoryOfficeDayRules: patch.mandatoryOfficeDayRules ?? current.mandatoryOfficeDayRules,
    targetOfficeRate: patch.targetOfficeRate ?? current.targetOfficeRate,
    closingDay: patch.closingDay ?? current.closingDay,
    closingDayShift: (patch.closingDayShift as ClosingDayShift) ?? current.closingDayShift,
    autoFetchHolidays: patch.autoFetchHolidays ?? current.autoFetchHolidays,
  };
  await updateUserSettings(db, userId, settings);
  return { settings };
}
