import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/http/client";
import { downloadFile } from "@/lib/http/download";
import {
  downloadMovementsExport,
  fetchMovements,
  fetchMovementsExportCount,
} from "./movements.service";

vi.mock("@/lib/http/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/http/download", () => ({ downloadFile: vi.fn() }));

describe("movements service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds the paginated movements path with operational filters", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], meta: {} });

    await fetchMovements({
      page: 2,
      limit: 20,
      search: "Ana Silva",
      source: "action_redeem",
      kind: "debit",
      from: "2026-08-22",
      to: "2026-08-24",
    });

    expect(apiFetch).toHaveBeenCalledWith(
      "/admin/point-events?page=2&limit=20&search=Ana+Silva&source=action_redeem&kind=debit&from=2026-08-22&to=2026-08-24",
    );
  });

  it("counts and downloads the same applied filters without pagination", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ count: 3, maxRows: 50_000 });
    vi.mocked(downloadFile).mockResolvedValue(undefined);
    const filters = {
      search: "Ana Silva",
      source: "admin_adjust" as const,
      kind: "credit" as const,
      from: "2026-08-22",
      to: "2026-08-24",
    };

    await fetchMovementsExportCount(filters);
    await downloadMovementsExport(filters);

    expect(apiFetch).toHaveBeenCalledWith(
      "/admin/point-events/export-count?search=Ana+Silva&source=admin_adjust&kind=credit&from=2026-08-22&to=2026-08-24",
    );
    expect(downloadFile).toHaveBeenCalledWith(
      "/admin/point-events/export.csv?search=Ana+Silva&source=admin_adjust&kind=credit&from=2026-08-22&to=2026-08-24",
    );
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).not.toContain("page");
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).not.toContain("limit");
    expect(vi.mocked(downloadFile).mock.calls[0]?.[0]).not.toContain("page");
    expect(vi.mocked(downloadFile).mock.calls[0]?.[0]).not.toContain("limit");
  });
});
