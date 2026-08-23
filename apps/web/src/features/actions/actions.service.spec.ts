import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/http/client";
import { downloadFile } from "@/lib/http/download";
import {
  bulkUpdateClaimCodes,
  downloadClaimCodeBulkReport,
  fetchClaimCodeBatches,
  fetchClaimCodeBulkOperation,
} from "./actions.service";

vi.mock("@/lib/http/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/http/download", () => ({ downloadFile: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);
const downloadFileMock = vi.mocked(downloadFile);

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

  it("envia a operação bulk apenas com os IDs explicitamente selecionados", async () => {
    const payload = {
      ids: ["code-1", "code-2"],
      isActive: false,
      reason: "Desativação preventiva do lote",
      confirmation: "DESATIVAR" as const,
    };

    await bulkUpdateClaimCodes(payload);

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/admin/claim-codes/bulk-status",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  });

  it("consulta o detalhe persistido e baixa o relatório CSV da operação", async () => {
    await fetchClaimCodeBulkOperation("bulk-1");
    await downloadClaimCodeBulkReport("bulk-1");

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/admin/claim-code-bulk-operations/bulk-1",
    );
    expect(downloadFileMock).toHaveBeenCalledWith(
      "/admin/claim-code-bulk-operations/bulk-1/report.csv",
    );
  });
});
