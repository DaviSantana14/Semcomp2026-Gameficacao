import { apiFetch } from "@/lib/http/client";
import { clearCsrfToken, setCsrfToken } from "@/lib/http/csrf";
import type {
  AdminLoginPayload,
  AdminActivationPayload,
  ChangeRequiredPasswordPayload,
  LoginPayload,
  LoginResponse,
  RegisterPayload,
  SessionSecurityResponse,
} from "./auth.types";

export function activateAdmin(payload: AdminActivationPayload) {
  return apiFetch<void>("/auth/admin/activate", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCsrf: true,
  });
}

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

export async function register(payload: RegisterPayload) {
  const response = await apiFetch<LoginResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCsrf: true,
  });
  setCsrfToken(response.csrfToken);
  return response;
}

export async function logout() {
  await apiFetch<void>("/auth/logout", {
    method: "POST",
  });
  clearCsrfToken();
}

export async function fetchSessionSecurity() {
  const response = await apiFetch<SessionSecurityResponse>("/auth/csrf");
  setCsrfToken(response.csrfToken);
  return response;
}

export async function changeRequiredPassword(
  payload: ChangeRequiredPasswordPayload,
) {
  await apiFetch<void>("/auth/password/change-required", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  clearCsrfToken();
}
