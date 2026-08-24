import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadClaimCodeBulkReport,
  fetchClaimCodeBulkOperation,
} from "@/features/actions/actions.service";
import type { ClaimCodeBulkOperationDetail } from "@/features/actions/actions.types";
import { renderWithQueryClient } from "@/test/render";
import { ClaimCodeBulkReport } from "./claim-code-bulk-report";

vi.mock("@/features/actions/actions.service", () => ({
  downloadClaimCodeBulkReport: vi.fn(),
  fetchClaimCodeBulkOperation: vi.fn(),
}));

const fetchBulkMock = vi.mocked(fetchClaimCodeBulkOperation);
const downloadBulkMock = vi.mocked(downloadClaimCodeBulkReport);

const operation: ClaimCodeBulkOperationDetail = {
  id: "bulk-1",
  actor: { id: "admin-1", name: "Admin", email: "admin@example.com" },
  targetIsActive: false,
  reason: "Desativação preventiva do lote",
  requestId: "request-1",
  counts: { selected: 4, changed: 1, unchanged: 1, used: 1, notFound: 1 },
  createdAt: "2026-08-23T12:00:00.000Z",
  items: [
    {
      requestedClaimCodeId: "code-1",
      claimCodeId: "code-1",
      maskedCode: "ABCD…1234",
      outcome: "CHANGED",
    },
    {
      requestedClaimCodeId: "code-2",
      claimCodeId: "code-2",
      maskedCode: "EFGH…5678",
      outcome: "ALREADY_IN_STATE",
    },
    {
      requestedClaimCodeId: "code-3",
      claimCodeId: "code-3",
      maskedCode: "IJKL…9012",
      outcome: "ALREADY_USED",
    },
    {
      requestedClaimCodeId: "missing-1",
      claimCodeId: null,
      maskedCode: null,
      outcome: "NOT_FOUND",
    },
  ],
};

describe("ClaimCodeBulkReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBulkMock.mockResolvedValue(operation);
    downloadBulkMock.mockResolvedValue();
  });

  it("mostra as quatro categorias persistidas e oferece o CSV", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <ClaimCodeBulkReport onClose={vi.fn()} operationId="bulk-1" />,
    );

    expect(
      await screen.findByRole("heading", { name: "Relatório da operação" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Alterados" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Sem alteração" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Já utilizados" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Não encontrados" }),
    ).toBeVisible();
    expect(screen.getByText("ABCD…1234")).toBeVisible();
    expect(screen.getByText("missing-1")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Baixar relatório CSV" }),
    );

    await waitFor(() =>
      expect(downloadBulkMock).toHaveBeenCalledWith("bulk-1"),
    );
  });
});
