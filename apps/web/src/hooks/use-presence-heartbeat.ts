"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { sendHeartbeat } from "@/features/presence/presence.service";
import { ApiError } from "@/lib/http/api-error";
import { clearCsrfToken } from "@/lib/http/csrf";

export function usePresenceHeartbeat() {
  const router = useRouter();

  useEffect(() => {
    let inFlight = false;
    let redirected = false;
    let controller: AbortController | undefined;

    const beat = async () => {
      if (inFlight || redirected) return;

      inFlight = true;
      controller = new AbortController();

      try {
        await sendHeartbeat(controller.signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          redirected = true;
          clearCsrfToken();
          router.replace("/login");
        }
      } finally {
        inFlight = false;
      }
    };

    void beat();
    const timer = window.setInterval(() => void beat(), 60_000);

    return () => {
      window.clearInterval(timer);
      controller?.abort();
    };
  }, [router]);
}
