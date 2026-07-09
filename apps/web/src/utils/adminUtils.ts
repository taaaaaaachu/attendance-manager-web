import type { AdminUserSummary } from "@attendance/shared";

/** 実際の出社率(%)が指定した閾値を下回るユーザーだけを抽出する。閾値未指定(null)なら全件を返す */
export function filterUsersBelowRate(
  users: readonly AdminUserSummary[],
  thresholdPercent: number | null,
): AdminUserSummary[] {
  if (thresholdPercent === null) {
    return [...users];
  }
  return users.filter((u) => u.stats.officeRate * 100 < thresholdPercent);
}
