import migration0001 from "../../migrations/0001_init.sql?raw";
import migration0002 from "../../migrations/0002_access_auth.sql?raw";

/** 全マイグレーションを順番に適用する。各テストファイルのbeforeAllで呼ぶ */
export async function applyMigrations(db: D1Database): Promise<void> {
  for (const sql of [migration0001, migration0002]) {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      // コメントだけの断片(ファイル末尾など)は実行しない
      .filter((s) => s.replace(/--[^\n]*/g, "").trim().length > 0);
    for (const statement of statements) {
      await db.prepare(statement).run();
    }
  }
}
