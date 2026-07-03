import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.route("/api/auth", authRoutes);

export default app;
