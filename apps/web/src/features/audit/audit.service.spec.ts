import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/http/client";
import { fetchAdminAuditEvents } from "./audit.service";

vi.mock("@/lib/http/client", () => ({ apiFetch: vi.fn() }));

describe("fetchAdminAuditEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serializa todos os filtros usando o cliente HTTP central", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await fetchAdminAuditEvents({
      page: 1,
      limit: 20,
      actorType: "ADMIN",
      actorAdminId: "admin-1",
      actorSearch: "Ada@example.com",
      operation: "ACTION_UPDATED",
      entityType: "ACTION",
      entityId: "action-1",
      entitySearch: "Palestra",
      participantId: "participant-1",
      participantSearch: "Grace",
      requestId: "request-1",
      from: "2026-07-01",
      to: "2026-07-03",
    });

    expect(apiFetch).toHaveBeenCalledWith(
      "/admin/audit-events?page=1&limit=20&actorType=ADMIN&actorAdminId=admin-1&actorSearch=Ada%40example.com&operation=ACTION_UPDATED&entityType=ACTION&entityId=action-1&entitySearch=Palestra&participantId=participant-1&participantSearch=Grace&requestId=request-1&from=2026-07-01T00%3A00%3A00.000-03%3A00&to=2026-07-03T23%3A59%3A59.999-03%3A00",
    );
  });
});
