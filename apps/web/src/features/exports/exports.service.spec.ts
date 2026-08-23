import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/http/client";
import { downloadFile } from "@/lib/http/download";
import {
  downloadParticipantsExport,
  downloadRedemptionsExport,
  fetchParticipantsExportCount,
  fetchRedemptionsExportCount,
} from "./exports.service";

vi.mock("@/lib/http/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/http/download", () => ({ downloadFile: vi.fn() }));

describe("admin export services", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds the participant count path from filters without pagination", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ count: 12, maxRows: 50_000 });

    await fetchParticipantsExportCount({
      search: "Ana Silva",
      status: "active",
    });

    expect(apiFetch).toHaveBeenCalledWith(
      "/admin/participants/export-count?search=Ana+Silva&status=active",
    );
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).not.toContain("page");
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).not.toContain("limit");
  });

  it("downloads participants with the same applied filters", async () => {
    vi.mocked(downloadFile).mockResolvedValue(undefined);

    await downloadParticipantsExport({
      search: "Ana Silva",
      status: "inactive",
    });

    expect(downloadFile).toHaveBeenCalledWith(
      "/admin/participants/export.csv?search=Ana+Silva&status=inactive",
    );
  });

  it("builds shop count and download paths with date and reward filters", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ count: 3, maxRows: 50_000 });
    vi.mocked(downloadFile).mockResolvedValue(undefined);
    const filters = {
      search: "Ana Silva",
      status: "pending" as const,
      rewardId: "reward-1",
      from: "2026-08-22",
      to: "2026-08-23",
    };

    await fetchRedemptionsExportCount(filters);
    await downloadRedemptionsExport(filters);

    expect(apiFetch).toHaveBeenCalledWith(
      "/admin/redemptions/export-count?search=Ana+Silva&status=pending&rewardId=reward-1&from=2026-08-22&to=2026-08-23",
    );
    expect(downloadFile).toHaveBeenCalledWith(
      "/admin/redemptions/export.csv?search=Ana+Silva&status=pending&rewardId=reward-1&from=2026-08-22&to=2026-08-23",
    );
  });
});
