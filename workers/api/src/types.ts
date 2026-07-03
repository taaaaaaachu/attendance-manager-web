export interface Bindings {
  DB: D1Database;
  ASSETS: Fetcher;
}

export interface Variables {
  userId: string;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
