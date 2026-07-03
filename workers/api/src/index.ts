import { Hono } from "hono";
import { attendanceRoutes } from "./routes/attendance";
import { authRoutes } from "./routes/auth";
import { companyHolidayRoutes, companyWorkingDayRoutes } from "./routes/companyDays";
import { exportRoutes } from "./routes/export";
import { holidayRoutes } from "./routes/holidays";
import { recordRoutes } from "./routes/records";
import { scheduleRoutes } from "./routes/schedule";
import { settingsRoutes } from "./routes/settings";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.route("/api/auth", authRoutes);
app.route("/api", recordRoutes);
app.route("/api", settingsRoutes);
app.route("/api/company-holidays", companyHolidayRoutes);
app.route("/api/company-working-days", companyWorkingDayRoutes);
app.route("/api/holidays", holidayRoutes);
app.route("/api/schedule", scheduleRoutes);
app.route("/api/attendance", attendanceRoutes);
app.route("/api/export", exportRoutes);

export default app;
