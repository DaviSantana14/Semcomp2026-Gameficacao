import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/http/client";
import type { SecurityMetricsOverview } from "./security-metrics.types";
import { fetchSecurityMetricsOverview } from "./security-metrics.service";

vi.mock("@/lib/http/client", () => ({
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);

const overview: SecurityMetricsOverview = {
  status: "NORMAL",
  lastFlushedMinute: "2026-08-23T12:00:00.000Z",
  periods: {
    fiveMinutes: { unauthorized: 2, forbidden: 1, rateLimited: 0 },
    oneHour: { unauthorized: 5, forbidden: 2, rateLimited: 1 },
    twentyFourHours: { unauthorized: 11, forbidden: 4, rateLimited: 2 },
  },
  thresholds: {
    unauthorized: 20,
    forbidden: 10,
    rateLimited: 5,
    windowMinutes: 5,
  },
};

describe("fetchSecurityMetricsOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the protected aggregated security overview", async () => {
    apiFetchMock.mockResolvedValueOnce(overview);

    await expect(fetchSecurityMetricsOverview()).resolves.toEqual(overview);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/admin/security-metrics/overview",
    );
  });
});
