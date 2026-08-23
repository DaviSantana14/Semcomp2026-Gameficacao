import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/http/client";
import { fetchClaimCodeBatches } from "./actions.service";

vi.mock("@/lib/http/client", () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);

describe("fetchClaimCodeBatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({} as never);
  });

  it("encaminha paginação e filtros para a consulta persistida de lotes", async () => {
    await fetchClaimCodeBatches({
      page: 2,
      limit: 10,
      actionId: "action-1",
      actorAdminId: "admin-1",
      from: "2026-08-01T03:00:00Z",
      to: "2026-08-23T03:00:00Z",
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/admin/claim-code-batches?page=2&limit=10&actionId=action-1&actorAdminId=admin-1&from=2026-08-01T03%3A00%3A00Z&to=2026-08-23T03%3A00%3A00Z",
    );
  });
});
