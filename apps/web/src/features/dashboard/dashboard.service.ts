import { apiFetch } from "@/lib/http/client";
import type { AdminDashboard } from "./dashboard.types";

export function fetchAdminDashboard() {
  return apiFetch<AdminDashboard>("/admin/dashboard");
}
