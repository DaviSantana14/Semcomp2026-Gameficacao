import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bulkUpdateClaimCodes,
  downloadClaimCodeBulkReport,
  fetchAdminActions,
  fetchAdminClaimCodes,
  fetchClaimCodeBulkOperation,
  updateClaimCodeStatus,
} from "@/features/actions/actions.service";
import type { ClaimCodeBulkOperationDetail } from "@/features/actions/actions.types";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { addClaimCodeSelection, ClaimCodeHistory } from "./claim-code-history";

vi.mock("@/features/actions/actions.service", () => ({
  bulkUpdateClaimCodes: vi.fn(),
  downloadClaimCodeBulkReport: vi.fn(),
  fetchAdminActions: vi.fn(),
  fetchAdminClaimCodes: vi.fn(),
  fetchClaimCodeBulkOperation: vi.fn(),
  updateClaimCodeStatus: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const bulkUpdateMock = vi.mocked(bulkUpdateClaimCodes);
const actionsMock = vi.mocked(fetchAdminActions);
const codesMock = vi.mocked(fetchAdminClaimCodes);
const fetchBulkMock = vi.mocked(fetchClaimCodeBulkOperation);
const downloadBulkMock = vi.mocked(downloadClaimCodeBulkReport);
const updateMock = vi.mocked(updateClaimCodeStatus);
const code = {
  id: "code-1",
  code: "ABCD-1234",
  status: "AVAILABLE" as const,
  isActive: true,
  isUsed: false,
  createdAt: "2026-07-12T12:00:00.000Z",
  usedAt: null,
  action: { id: "action-1", name: "Check-in" },
  usedBy: null,
};
const bulkOperation: ClaimCodeBulkOperationDetail = {
  id: "bulk-1",
  actor: { id: "admin-1", name: "Admin", email: "admin@example.com" },
  targetIsActive: false,
  reason: "Desativação preventiva",
  requestId: "request-1",
  counts: { selected: 1, changed: 1, unchanged: 0, used: 0, notFound: 0 },
  createdAt: "2026-08-23T12:00:00.000Z",
  items: [
    {
      requestedClaimCodeId: "code-1",
      claimCodeId: "code-1",
      maskedCode: "ABCD…1234",
      outcome: "CHANGED",
    },
  ],
};

describe("ClaimCodeHistory audited status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bulkUpdateMock.mockResolvedValue({} as never);
    downloadBulkMock.mockResolvedValue();
    fetchBulkMock.mockResolvedValue({} as never);
    actionsMock.mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
    codesMock.mockResolvedValue({
      items: [code],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it("mostra o código alvo e preserva reason no erro", async () => {
    updateMock.mockRejectedValueOnce(new ApiError("Falha controlada", 400));
    const user = userEvent.setup();
    renderWithQueryClient(<ClaimCodeHistory />);

    await user.click(await screen.findByRole("button", { name: "Desativar" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Código ABCD-1234 · Check-in"),
    ).toBeVisible();
    await user.type(
      within(dialog).getByLabelText("Motivo"),
      "Código comprometido",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar alteração" }),
    );

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("code-1", {
        isActive: false,
        reason: "Código comprometido",
      }),
    );
    expect(within(dialog).getByLabelText("Motivo")).toHaveValue(
      "Código comprometido",
    );
  });

  it("seleciona a página sem incluir códigos usados e preserva apenas IDs explícitos", async () => {
    const usedCode = {
      ...code,
      id: "code-used",
      code: "USED-1234",
      status: "USED" as const,
      isActive: false,
      isUsed: true,
      usedAt: "2026-07-13T12:00:00.000Z",
      usedBy: {
        id: "participant-1",
        name: "Pessoa",
        email: "pessoa@example.com",
      },
    };
    const secondCode = { ...code, id: "code-2", code: "EFGH-5678" };
    codesMock.mockResolvedValue({
      items: [code, secondCode, usedCode],
      meta: { page: 1, limit: 10, total: 3, totalPages: 1 },
    });
    const user = userEvent.setup();
    renderWithQueryClient(<ClaimCodeHistory />);

    expect(
      await screen.findByRole("checkbox", {
        name: "Selecionar todos os códigos disponíveis desta página",
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("checkbox", { name: "Selecionar código USED-1234" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todos os códigos disponíveis desta página",
      }),
    );

    expect(screen.getByText("2 códigos selecionados")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Desativar selecionados" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Ativar selecionados" }),
    ).toBeEnabled();
    expect(bulkUpdateMock).not.toHaveBeenCalled();
  });

  it("limita a seleção explícita a 500 códigos", () => {
    const manyIds = Array.from(
      { length: 501 },
      (_, index) => `code-${index + 1}`,
    );
    const result = addClaimCodeSelection(new Set(), manyIds);

    expect(result.selection).toHaveLength(500);
    expect(result.truncated).toBe(true);
  });

  it("mantém somente os IDs escolhidos ao mudar de página", async () => {
    const pageTwoCode = { ...code, id: "code-2", code: "EFGH-5678" };
    codesMock.mockImplementation(async ({ page }) =>
      page === 1
        ? {
            items: [code],
            meta: { page: 1, limit: 10, total: 2, totalPages: 2 },
          }
        : {
            items: [pageTwoCode],
            meta: { page: 2, limit: 10, total: 2, totalPages: 2 },
          },
    );
    const user = userEvent.setup();
    renderWithQueryClient(<ClaimCodeHistory />);

    await user.click(
      await screen.findByRole("checkbox", {
        name: "Selecionar código ABCD-1234",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Próxima página" }));

    expect(
      await screen.findByRole("checkbox", {
        name: "Selecionar código EFGH-5678",
      }),
    ).not.toBeChecked();
    expect(
      screen.queryByRole("checkbox", { name: "Selecionar código ABCD-1234" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 código selecionado")).toBeVisible();
  });

  it("limpa a seleção, invalida as listas e mostra o relatório persistido após sucesso", async () => {
    bulkUpdateMock.mockResolvedValue(bulkOperation);
    fetchBulkMock.mockResolvedValue(bulkOperation);
    const user = userEvent.setup();
    renderWithQueryClient(<ClaimCodeHistory />);

    await user.click(
      await screen.findByRole("checkbox", {
        name: "Selecionar código ABCD-1234",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Desativar selecionados" }),
    );
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Motivo"),
      "Desativação preventiva",
    );
    await user.type(within(dialog).getByLabelText("Confirmação"), "DESATIVAR");
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar desativação" }),
    );

    await waitFor(() =>
      expect(bulkUpdateMock).toHaveBeenCalledWith({
        ids: ["code-1"],
        isActive: false,
        reason: "Desativação preventiva",
        confirmation: "DESATIVAR",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Relatório da operação" }),
    ).toBeVisible();
    expect(screen.getByText("0 códigos selecionados")).toBeVisible();
    expect(fetchBulkMock).toHaveBeenCalledWith("bulk-1");
    expect(codesMock.mock.calls.length).toBeGreaterThan(1);
  });
});
