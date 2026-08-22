import { apiFetch } from "@/lib/http/client";

export function sendHeartbeat(signal: AbortSignal): Promise<void> {
  return apiFetch<void>("/auth/heartbeat", {
    method: "POST",
    signal,
  });
}
