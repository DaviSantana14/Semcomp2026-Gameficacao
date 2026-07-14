import { apiFetch } from "@/lib/http/client";
import type { User } from "./users.types";

export function fetchMe() {
  return apiFetch<User>("/users/me");
}
