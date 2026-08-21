import { apiFetch } from "@/lib/http/client";
import { clearCsrfToken, setCsrfToken } from "@/lib/http/csrf";
import type { User } from "@/features/users/users.types";
import type {
  AdminLoginPayload,
  LoginPayload,
  LoginResponse,
  RegisterPayload,
} from "./auth.types";

export async function login(payload: LoginPayload) {
  const response = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCsrf: true,
  });
  setCsrfToken(response.csrfToken);
  return response;
}

export async function adminLogin(payload: AdminLoginPayload) {
  const response = await apiFetch<LoginResponse>("/auth/admin/login", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCsrf: true,
  });
  setCsrfToken(response.csrfToken);
  return response;
}

export function register(payload: RegisterPayload) {
  return apiFetch<User>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCsrf: true,
  });
}

export async function logout() {
  await apiFetch<void>("/auth/logout", {
    method: "POST",
  });
  clearCsrfToken();
}
