export interface Bindings {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Cloudflare Accessのチームドメイン(例: example.cloudflareaccess.com) */
  ACCESS_TEAM_DOMAIN: string;
  /** AccessアプリケーションのAUDタグ(JWTのaud検証に使う) */
  ACCESS_AUD: string;
  /**
   * ローカル開発用の固定ユーザー(.dev.varsで設定)。Access層がないwrangler devで
   * 認証をバイパスするためのもので、本番では設定しないこと。
   */
  DEV_USER_EMAIL?: string;
}

export interface Variables {
  /** 認証済みユーザーのID(Accessで認証されたメールアドレス、小文字正規化済み) */
  userId: string;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
