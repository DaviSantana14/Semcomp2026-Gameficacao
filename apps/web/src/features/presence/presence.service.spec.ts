import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/http/client";
import { downloadFile } from "@/lib/http/download";
import {
  encodePresenceDateRange,
  downloadPresenceCsv,
  fetchPresenceHistory,
  fetchPresenceOverview,
  getDefaultPresenceRange,
  sendHeartbeat,
} from "./presence.service";

vi.mock("@/lib/http/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/http/download", () => ({ downloadFile: vi.fn() }));

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

describe("presence reads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches the admin overview from its independent endpoint", async () => {
    vi.mocked(apiFetch).mockResolvedValue({} as never);

    await fetchPresenceOverview();

    expect(apiFetch).toHaveBeenCalledWith("/admin/presence/overview");
  });

  it("shares one date encoder for history requests", async () => {
    const range = { from: "2026-08-15", to: "2026-08-23" };
    vi.mocked(apiFetch).mockResolvedValue({} as never);

    expect(encodePresenceDateRange(range)).toBe("from=2026-08-15&to=2026-08-23");

    await fetchPresenceHistory(range);

    expect(apiFetch).toHaveBeenCalledWith(
      "/admin/presence/history?from=2026-08-15&to=2026-08-23",
    );
  });

  it("uses the same date encoder for the aggregate CSV endpoint", async () => {
    vi.mocked(downloadFile).mockResolvedValue(undefined);

    await downloadPresenceCsv({ from: "2026-08-16", to: "2026-08-23" });

    expect(downloadFile).toHaveBeenCalledWith(
      "/admin/presence/export.csv?from=2026-08-16&to=2026-08-23",
    );
  });

  it("defaults to the seven operational days ending tomorrow", () => {
    expect(getDefaultPresenceRange(new Date("2026-08-22T12:00:00.000Z"))).toEqual({
      from: "2026-08-16",
      to: "2026-08-23",
    });
  });
});
