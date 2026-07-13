import { nowIso } from "./data";

/**
 * アカウント連携(複数メールを1つのカレンダーに束ねる)のデータアクセス層。
 *
 * データ実体はメールアドレス(user_id)キーのまま。連携とは「認証済みメールを、有効な
 * カレンダー所有者に変換する一段の写像(リゾルバ)」であり、その関係を account_links /
 * link_requests の2テーブルで表す。構造は常にフラット・スター(所有者1つに複数メンバーが
 * ぶら下がる。連鎖・多重参加は禁止)。詳細は docs/adr/0002-account-linking.md。
 */

export interface LinkRequestRow {
  email: string;
  createdAt: string;
}

export interface LinkState {
  /** 自分が所有者のとき、参加しているメンバーのメール一覧 */
  members: string[];
  /** 自分が連携メンバーのとき、共有カレンダー所有者のメール(でなければ null) */
  owner: string | null;
  /** 自分宛(target)の未承認申請 = 承認/却下できるもの */
  incoming: LinkRequestRow[];
  /** 自分発(requester)の未承認申請 = 取消できるもの */
  outgoing: LinkRequestRow[];
}

/** 連携操作が制約に反したときに投げる。route層で400として扱う */
export class LinkError extends Error {}

/**
 * 認証済みメールを、勤怠データの読み書き先(カレンダー所有者)に解決する。
 * 連携メンバーなら所有者を、そうでなければ自分自身を返す(常に一段で解決)。
 */
export async function resolveCalendarOwner(db: D1Database, email: string): Promise<string> {
  const row = await db
    .prepare("SELECT owner_email FROM account_links WHERE member_email = ?")
    .bind(email)
    .first<{ owner_email: string }>();
  return row?.owner_email ?? email;
}

/** email が誰かのカレンダーに参加しているメンバーか */
async function isMember(db: D1Database, email: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 FROM account_links WHERE member_email = ?")
    .bind(email)
    .first();
  return row != null;
}

/** email が1人以上のメンバーを抱える所有者か */
async function isOwner(db: D1Database, email: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 FROM account_links WHERE owner_email = ? LIMIT 1")
    .bind(email)
    .first();
  return row != null;
}

/** 自分に関わる連携の全状態を返す(設定画面の「アカウント連携」セクション用) */
export async function getLinkState(db: D1Database, email: string): Promise<LinkState> {
  const [membersRes, ownerRow, incomingRes, outgoingRes] = await Promise.all([
    db.prepare("SELECT member_email FROM account_links WHERE owner_email = ? ORDER BY member_email").bind(email).all<{ member_email: string }>(),
    db.prepare("SELECT owner_email FROM account_links WHERE member_email = ?").bind(email).first<{ owner_email: string }>(),
    db.prepare("SELECT requester_email, created_at FROM link_requests WHERE target_email = ? ORDER BY created_at").bind(email).all<{ requester_email: string; created_at: string }>(),
    db.prepare("SELECT target_email, created_at FROM link_requests WHERE requester_email = ? ORDER BY created_at").bind(email).all<{ target_email: string; created_at: string }>(),
  ]);

  return {
    members: membersRes.results.map((r) => r.member_email),
    owner: ownerRow?.owner_email ?? null,
    incoming: incomingRes.results.map((r) => ({ email: r.requester_email, createdAt: r.created_at })),
    outgoing: outgoingRes.results.map((r) => ({ email: r.target_email, createdAt: r.created_at })),
  };
}

/** 自分宛の未承認申請の件数(ヘッダーのバッジ用) */
export async function countIncomingRequests(db: D1Database, email: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM link_requests WHERE target_email = ?")
    .bind(email)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * 連携申請を作成する。requester(A)が自分のカレンダーに target(B)を招く。
 * フラット・スター維持のための制約をすべて検証する。
 */
export async function createLinkRequest(
  db: D1Database,
  requester: string,
  target: string,
): Promise<void> {
  if (target === requester) {
    throw new LinkError("自分自身には申請できません");
  }
  // A自身が誰かのカレンダーに参加中だと、Aは所有者になれない(連鎖の禁止)
  if (await isMember(db, requester)) {
    throw new LinkError("あなたは別のカレンダーに参加中のため申請できません。先に解除してください");
  }
  // B が既に誰かのメンバー = 多重参加になる
  if (await isMember(db, target)) {
    throw new LinkError("相手は既に別のカレンダーに参加しています");
  }
  // B が所有者(メンバーを抱えている) = グループの併合になる
  if (await isOwner(db, target)) {
    throw new LinkError("相手は既に自分のカレンダーに他のメンバーを連携しています");
  }
  // 既存の申請(どちらの向きでも)があれば重複
  const existing = await db
    .prepare(
      "SELECT 1 FROM link_requests WHERE (requester_email = ? AND target_email = ?) OR (requester_email = ? AND target_email = ?)",
    )
    .bind(requester, target, target, requester)
    .first();
  if (existing) {
    throw new LinkError("その相手とは既に申請中です");
  }

  await db
    .prepare("INSERT INTO link_requests (requester_email, target_email, created_at) VALUES (?, ?, ?)")
    .bind(requester, target, nowIso())
    .run();
}

/**
 * target(B)が requester(A)からの申請を承認する。申請作成後に状態が変わっている
 * 可能性があるため、フラット・スター制約を再検証してから成立させる。
 */
export async function acceptLinkRequest(
  db: D1Database,
  target: string,
  requester: string,
): Promise<void> {
  const req = await db
    .prepare("SELECT 1 FROM link_requests WHERE requester_email = ? AND target_email = ?")
    .bind(requester, target)
    .first();
  if (!req) {
    throw new LinkError("該当する申請が見つかりません");
  }
  if (await isMember(db, target)) {
    throw new LinkError("あなたは既に別のカレンダーに参加しています");
  }
  if (await isOwner(db, target)) {
    throw new LinkError("あなたは既に自分のカレンダーに他のメンバーを連携しています");
  }
  if (await isMember(db, requester)) {
    throw new LinkError("申請者が別のカレンダーに参加中のため成立できません");
  }

  // 成立させ、B に関わる申請(送受信いずれも)は無効になるので一掃する
  await db.batch([
    db
      .prepare("INSERT INTO account_links (owner_email, member_email, created_at) VALUES (?, ?, ?)")
      .bind(requester, target, nowIso()),
    db
      .prepare("DELETE FROM link_requests WHERE target_email = ? OR requester_email = ?")
      .bind(target, target),
  ]);
}

/** target(B)が requester(A)からの申請を却下する */
export async function rejectLinkRequest(
  db: D1Database,
  target: string,
  requester: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM link_requests WHERE requester_email = ? AND target_email = ?")
    .bind(requester, target)
    .run();
}

/** requester(A)が自分の送った申請を取り消す */
export async function cancelLinkRequest(
  db: D1Database,
  requester: string,
  target: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM link_requests WHERE requester_email = ? AND target_email = ?")
    .bind(requester, target)
    .run();
}

/** 所有者(A)がメンバー(B)を解除する */
export async function removeMember(db: D1Database, owner: string, member: string): Promise<void> {
  await db
    .prepare("DELETE FROM account_links WHERE owner_email = ? AND member_email = ?")
    .bind(owner, member)
    .run();
}

/** メンバー(B)が自分の参加を解除して離脱する */
export async function leaveLink(db: D1Database, member: string): Promise<void> {
  await db.prepare("DELETE FROM account_links WHERE member_email = ?").bind(member).run();
}
