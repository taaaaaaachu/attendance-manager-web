import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  addCompanyDay,
  deleteRecord,
  getAllRecords,
  getCompanyHolidays,
  getCompanyWorkingDays,
  getJapanHolidays,
  getUserSettings,
  removeCompanyDay,
  upsertRecord,
} from "./data";
import { loadStatsForUser } from "./period";
import { applySchedule } from "./schedule";
import { CLOSING_DAY_SHIFTS, patchUserSettings } from "./settings";

/**
 * エージェント向けのMCPサーバー(ADR 0004)。1リクエストごとに、接続の発行者から解決した
 * カレンダー所有者で作る。中身は画面向けAPIと同じlibの関数を呼ぶだけで、同じ規則に従う。
 * アカウント連携・管理者機能・全件リセット・祝日の再取得(全ユーザー共通データ)は出さない。
 */

const INSTRUCTIONS = `出社・在宅管理は、日ごとの勤怠(出社 office・在宅 remote・有給 paidleave)を記録し、締め日で区切った期間ごとの出社率を集計するアプリです。
この接続で操作できるのは1つのカレンダーだけです(アカウント連携しているなら、共有しているカレンダー)。
- 日付は YYYY-MM-DD(日本時間)で渡します。
- 期間は締め日の設定で決まります。offsetMonths は今の期間からのずれ(0=今の期間、-1=前の期間、1=次の期間)です。
- 出社率は 出社 /(出社 + 在宅)で、有給と休日は数えません。休日は土日・日本の祝日・会社の休日で、会社の出勤日はそれを出勤に上書きします。`;

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), {
    message: "実在する日付を指定してください",
  })
  .describe("YYYY-MM-DD");
const status = z.enum(["office", "remote", "paidleave"]).describe("office=出社、remote=在宅、paidleave=有給");
const offsetMonths = z.number().int().min(-120).max(120).optional().describe("今の期間からのずれ(省略時0)");
const companyDayKind = z.enum(["holiday", "working_day"]).describe("holiday=会社の休日、working_day=会社の出勤日");

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}
function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

const tableOf = (kind: "holiday" | "working_day") => (kind === "holiday" ? "company_holidays" : "company_working_days");

export function createMcpServer(db: D1Database, calendarOwnerId: string): McpServer {
  const owner = calendarOwnerId;
  const server = new McpServer({ name: "attendance-manager", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  // --- 勤怠 ---

  server.registerTool(
    "list_records",
    {
      title: "勤怠一覧",
      description: "勤怠の記録を日付順に返す。start・end で範囲を絞れる(両端を含む)。",
      inputSchema: z.object({ start: date.optional(), end: date.optional() }),
      annotations: READ,
    },
    async ({ start, end }) => {
      const all = await getAllRecords(db, owner);
      const records = Array.from(all.values())
        .filter((r) => (!start || r.date >= start) && (!end || r.date <= end))
        .sort((a, b) => a.date.localeCompare(b.date));
      return ok({ records });
    },
  );

  server.registerTool(
    "set_record",
    {
      title: "勤怠を記録",
      description: "1日分の勤怠を記録する。既に記録があれば上書きする。",
      inputSchema: z.object({ date, status }),
      annotations: WRITE,
    },
    async (input) => {
      await upsertRecord(db, owner, input.date, input.status);
      return ok(input);
    },
  );

  server.registerTool(
    "delete_record",
    {
      title: "勤怠の記録を消す",
      description: "1日分の勤怠の記録を消す(未記録に戻す)。",
      inputSchema: z.object({ date }),
      annotations: DESTRUCTIVE,
    },
    async (input) => {
      await deleteRecord(db, owner, input.date);
      return ok({ deleted: input.date });
    },
  );

  server.registerTool(
    "get_period_stats",
    {
      title: "期間と出社率",
      description:
        "期間(開始日・終了日)と、その期間の営業日数・出社日数・在宅日数・出社率・残り営業日数・目標達成に必要な残り出社日数を返す。",
      inputSchema: z.object({ offsetMonths }),
      annotations: READ,
    },
    async (input) => {
      const { context, stats } = await loadStatsForUser(db, owner, input.offsetMonths ?? 0);
      return ok({ period: context.period, targetOfficeRate: context.settings.targetOfficeRate, stats });
    },
  );

  // --- 設定 ---

  server.registerTool(
    "get_settings",
    {
      title: "設定",
      description: "目標出社率・締め日・必須出社日などの設定を返す。",
      annotations: READ,
    },
    async () => ok(await getUserSettings(db, owner)),
  );

  server.registerTool(
    "update_settings",
    {
      title: "設定を変更",
      description: "設定を変更する。渡した項目だけ変わる。",
      inputSchema: z.object({
        mandatoryOfficeDayRules: z
          .array(z.number().int().min(1).max(31))
          .optional()
          .describe("毎月の必須出社日(日にち。例: [1, 16])"),
        targetOfficeRate: z.number().min(0).max(100).optional().describe("目標出社率(%)"),
        closingDay: z.number().int().min(0).max(31).optional().describe("締め日(0=月末)"),
        closingDayShift: z
          .enum(CLOSING_DAY_SHIFTS as [string, ...string[]])
          .optional()
          .describe("締め日が休日のとき: none=そのまま、previous=前の営業日、next=次の営業日"),
        autoFetchHolidays: z.boolean().optional().describe("日本の祝日を自動で取得するか"),
      }),
      annotations: WRITE,
    },
    async (patch) => {
      const result = await patchUserSettings(db, owner, patch);
      return "error" in result ? fail(result.error) : ok(result.settings);
    },
  );

  // --- 休日 ---

  server.registerTool(
    "list_company_days",
    {
      title: "会社の休日・出勤日",
      description: "会社の休日(平日を休みにする日)と、会社の出勤日(土日祝を出勤にする日)を返す。",
      annotations: READ,
    },
    async () => {
      const [holidays, workingDays] = await Promise.all([getCompanyHolidays(db, owner), getCompanyWorkingDays(db, owner)]);
      return ok({ holidays: Array.from(holidays).sort(), workingDays: Array.from(workingDays).sort() });
    },
  );

  server.registerTool(
    "add_company_day",
    {
      title: "会社の休日・出勤日を追加",
      description: "会社の休日、または会社の出勤日を1日追加する。",
      inputSchema: z.object({ kind: companyDayKind, date }),
      annotations: WRITE,
    },
    async (input) => {
      await addCompanyDay(db, tableOf(input.kind), owner, input.date);
      return ok(input);
    },
  );

  server.registerTool(
    "remove_company_day",
    {
      title: "会社の休日・出勤日を消す",
      description: "会社の休日、または会社の出勤日を1日消す。",
      inputSchema: z.object({ kind: companyDayKind, date }),
      annotations: DESTRUCTIVE,
    },
    async (input) => {
      await removeCompanyDay(db, tableOf(input.kind), owner, input.date);
      return ok({ removed: input });
    },
  );

  server.registerTool(
    "list_japan_holidays",
    {
      title: "日本の祝日",
      description: "取得済みの日本の祝日を返す。year で年を絞れる。",
      inputSchema: z.object({ year: z.number().int().min(1955).max(2100).optional() }),
      annotations: READ,
    },
    async ({ year }) => {
      const all = await getJapanHolidays(db);
      return ok({ holidays: Array.from(all).filter((d) => !year || d.startsWith(`${year}-`)).sort() });
    },
  );

  // --- スケジュール ---

  server.registerTool(
    "apply_schedule",
    {
      title: "スケジュールを一括適用",
      description:
        "期間内の営業日を、在宅曜日なら在宅・それ以外は出社で一括記録する。既に有給の日は変えない。" +
        "適用すると目標出社率を下回る場合は適用せず warning: true と見込みの統計を返すので、それでも適用するなら force: true で呼び直す。",
      inputSchema: z.object({
        remoteWeekdays: z.array(z.number().int().min(0).max(6)).describe("在宅にする曜日(0=日曜〜6=土曜)"),
        force: z.boolean().optional().describe("目標出社率を下回っても適用する"),
        offsetMonths,
      }),
      // 既存の出社・在宅の記録を上書きするため destructive とする
      annotations: DESTRUCTIVE,
    },
    async (input) =>
      ok(
        await applySchedule(db, owner, {
          remoteWeekdays: input.remoteWeekdays,
          force: input.force ?? false,
          offsetMonths: input.offsetMonths ?? 0,
        }),
      ),
  );

  return server;
}
