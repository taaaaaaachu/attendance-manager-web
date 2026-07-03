import type { UserSettings } from "@attendance/shared";
import { apiFetch } from "./client";

export function getSettings(): Promise<UserSettings> {
  return apiFetch("/settings");
}

export function updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  return apiFetch("/settings", { method: "PUT", body: JSON.stringify(patch) });
}
