import { Hono } from "hono";
import { adminRoutes } from "./routes/admin";
import { attendanceRoutes } from "./routes/attendance";
import { authRoutes } from "./routes/auth";
import { companyHolidayRoutes, companyWorkingDayRoutes } from "./routes/companyDays";
import { exportRoutes } from "./routes/export";
import { holidayRoutes } from "./routes/holidays";
import { linkRoutes } from "./routes/links";
import { mcpRoutes } from "./routes/mcp";
import { oauthRoutes, wellKnownRoutes } from "./routes/oauth";
import { recordRoutes } from "./routes/records";
import { scheduleRoutes } from "./routes/schedule";
import { settingsRoutes } from "./routes/settings";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

// APIの応答(認証層の302を含むリダイレクトも)がブラウザのHTTPキャッシュに残ると、
// 古い応答が返り続けて認証復帰後もアプリが詰まる事故につながるため、一切キャッシュさせない
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

app.route("/api/auth", authRoutes);
app.route("/api", recordRoutes);
app.route("/api", settingsRoutes);
app.route("/api/company-holidays", companyHolidayRoutes);
app.route("/api/company-working-days", companyWorkingDayRoutes);
app.route("/api/holidays", holidayRoutes);
app.route("/api/schedule", scheduleRoutes);
app.route("/api/attendance", attendanceRoutes);
app.route("/api/export", exportRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/links", linkRoutes);

// エージェント向け(ADR 0004)。/oauth/authorize 以外はCloudflare AccessをBypassするパスなので、
// 各ルートは requireAccessAuth を通さず、トークン・認可コードだけで認証する
app.route("/mcp", mcpRoutes);
app.route("/oauth", oauthRoutes);
app.route("/.well-known", wellKnownRoutes);

export default app;
