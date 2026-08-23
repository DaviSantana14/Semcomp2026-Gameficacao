import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulkUpdateClaimCodes } from "@/features/actions/actions.service";
import type { ClaimCodeBulkOperationDetail } from "@/features/actions/actions.types";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { ClaimCodeBulkDialog } from "./claim-code-bulk-dialog";

vi.mock("@/features/actions/actions.service", () => ({
  bulkUpdateClaimCodes: vi.fn(),
}));

const bulkUpdateMock = vi.mocked(bulkUpdateClaimCodes);

const operation: ClaimCodeBulkOperationDetail = {
  id: "bulk-1",
  actor: { id: "admin-1", name: "Admin", email: "admin@example.com" },
  targetIsActive: false,
  reason: "Desativação preventiva do lote",
  requestId: "request-1",
  counts: { selected: 2, changed: 1, unchanged: 1, used: 0, notFound: 0 },
  createdAt: "2026-08-23T12:00:00.000Z",
  items: [],
};

describe("ClaimCodeBulkDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bulkUpdateMock.mockResolvedValue(operation);
  });

  it("exige a palavra digitada e envia somente a seleção explícita", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    renderWithQueryClient(
      <ClaimCodeBulkDialog
        intent="deactivate"
        onClose={onClose}
        onSuccess={onSuccess}
        selectedIds={new Set(["code-1", "code-2"])}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", {
      name: "Confirmar desativação",
    });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByLabelText("Confirmação")).toHaveValue("");

    await user.type(
      within(dialog).getByLabelText("Motivo"),
      "  Desativação preventiva do lote  ",
    );
    await user.type(within(dialog).getByLabelText("Confirmação"), "DESATIVAR");
    await user.click(submit);

    await waitFor(() =>
      expect(bulkUpdateMock).toHaveBeenCalledWith({
        ids: ["code-1", "code-2"],
        isActive: false,
        reason: "Desativação preventiva do lote",
        confirmation: "DESATIVAR",
      }),
    );
    expect(onSuccess).toHaveBeenCalledWith(operation);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("mantém o motivo e permite retry depois de uma falha da mutation", async () => {
    bulkUpdateMock
      .mockRejectedValueOnce(new ApiError("Falha controlada", 409))
      .mockResolvedValueOnce(operation);
    const user = userEvent.setup();
    renderWithQueryClient(
      <ClaimCodeBulkDialog
        intent="activate"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        selectedIds={new Set(["code-1"])}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const reason = within(dialog).getByLabelText("Motivo");
    const confirmation = within(dialog).getByLabelText("Confirmação");
    await user.type(reason, "Reativação após conferência");
    await user.type(confirmation, "ATIVAR");
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar ativação" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Falha controlada",
    );
    expect(reason).toHaveValue("Reativação após conferência");
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar ativação" }),
    );

    await waitFor(() => expect(bulkUpdateMock).toHaveBeenCalledTimes(2));
    expect(bulkUpdateMock).toHaveBeenLastCalledWith({
      ids: ["code-1"],
      isActive: true,
      reason: "Reativação após conferência",
      confirmation: "ATIVAR",
    });
  });
});
