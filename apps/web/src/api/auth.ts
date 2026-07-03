import { apiFetch } from "./client";

export interface CurrentUser {
  userId: string;
  email: string | null;
}

export function register(userId: string, password: string): Promise<{ userId: string }> {
  return apiFetch("/auth/register", { method: "POST", body: JSON.stringify({ userId, password }) });
}

export function login(userId: string, password: string): Promise<{ userId: string }> {
  return apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ userId, password }) });
}

export function logout(): Promise<{ ok: boolean }> {
  return apiFetch("/auth/logout", { method: "POST" });
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiFetch("/auth/me");
}
