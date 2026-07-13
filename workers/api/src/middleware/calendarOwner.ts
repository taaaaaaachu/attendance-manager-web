import { createMiddleware } from "hono/factory";
import { resolveCalendarOwner } from "../lib/links";
import type { AppEnv } from "../types";

/**
 * アカウント連携のリゾルバ。requireAccessAuth の後段に置く。
 *
 * 認証済みメール(userId)を「勤怠データの読み書き先」= カレンダー所有者に解決し、
 * calendarOwnerId にセットする。未連携なら自分自身、連携メンバーなら共有カレンダー
 * 所有者(本体)になる。勤怠・会社休日・設定・スケジュール・エクスポート等の
 * ユーザースコープのデータ系ルートは、userId ではなく calendarOwnerId を使うこと。
 */
export const withCalendarOwner = createMiddleware<AppEnv>(async (c, next) => {
  const owner = await resolveCalendarOwner(c.env.DB, c.get("userId"));
  c.set("calendarOwnerId", owner);
  await next();
});
