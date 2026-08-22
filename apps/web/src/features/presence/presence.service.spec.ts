import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/http/client";
import { sendHeartbeat } from "./presence.service";

vi.mock("@/lib/http/client", () => ({ apiFetch: vi.fn() }));

describe("sendHeartbeat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the protected heartbeat endpoint and forwards the abort signal", async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiFetch).mockResolvedValue(undefined);

    await sendHeartbeat(signal);

    expect(apiFetch).toHaveBeenCalledWith("/auth/heartbeat", {
      method: "POST",
      signal,
    });
  });
});
