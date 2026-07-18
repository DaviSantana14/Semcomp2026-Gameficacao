import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAdminActions,
  fetchAdminClaimCodes,
  updateClaimCodeStatus,
} from "@/features/actions/actions.service";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { ClaimCodeHistory } from "./claim-code-history";

vi.mock("@/features/actions/actions.service", () => ({
  fetchAdminActions: vi.fn(),
  fetchAdminClaimCodes: vi.fn(),
  updateClaimCodeStatus: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const actionsMock = vi.mocked(fetchAdminActions);
const codesMock = vi.mocked(fetchAdminClaimCodes);
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

describe("ClaimCodeHistory audited status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
