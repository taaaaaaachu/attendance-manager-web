export interface Bindings {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Cloudflare Accessのチームドメイン(例: your-team.cloudflareaccess.com) */
  ACCESS_TEAM_DOMAIN: string;
  /** AccessアプリケーションのAUDタグ(JWTのaud検証に使う) */
  ACCESS_AUD: string;
  /**
   * ローカル開発用の固定ユーザー(.dev.varsで設定)。Access層がないwrangler devで
   * 認証をバイパスするためのもので、本番では設定しないこと。
   */
  DEV_USER_EMAIL?: string;
  /** 管理者のメールアドレス(カンマ区切り)。ロールを持つテーブルが無いため設定値で判定する */
  ADMIN_EMAILS: string;
}

export interface Variables {
  /** 認証済みユーザーのID(Accessで認証されたメールアドレス、小文字正規化済み) */
  userId: string;
  /**
   * 勤怠データの読み書き先メールアドレス。アカウント連携のリゾルバで解決した値。
   * 未連携なら userId と同じ、連携メンバーなら共有カレンダー所有者(本体)のメールになる。
   * withCalendarOwner ミドルウェアを通したデータ系ルートでのみ利用可能。
   */
  calendarOwnerId: string;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
