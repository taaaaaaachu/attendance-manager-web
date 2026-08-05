import type { AdminUserDetail, AdminUserSummary } from "@attendance/shared";
import { apiFetch } from "./client";

export async function getAdminUsers(offsetMonths = 0): Promise<AdminUserSummary[]> {
  const { users } = await apiFetch<{ users: AdminUserSummary[] }>(
    `/admin/users?offsetMonths=${offsetMonths}`,
  );
  return users;
}

export function getAdminUserDetail(userId: string, offsetMonths = 0): Promise<AdminUserDetail> {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/records?offsetMonths=${offsetMonths}`);
}

export function deleteAdminUser(userId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE", userInitiated: true });
}
