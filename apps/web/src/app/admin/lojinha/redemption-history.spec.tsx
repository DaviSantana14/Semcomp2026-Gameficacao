import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelRedemption,
  deliverRedemption,
  fetchAdminRedemptions,
} from "@/features/rewards/rewards.service";
import type { AdminRedemption } from "@/features/rewards/rewards.types";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { RedemptionHistory } from "./redemption-history";

vi.mock("@/features/rewards/rewards.service", () => ({
  cancelRedemption: vi.fn(),
  deliverRedemption: vi.fn(),
  fetchAdminRedemptions: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const fetchMock = vi.mocked(fetchAdminRedemptions);
const deliverMock = vi.mocked(deliverRedemption);
const cancelMock = vi.mocked(cancelRedemption);
const reward = {
  id: "reward-1",
  name: "Camiseta",
  description: null,
  costInPoints: 100,
  stock: 3,
  isActive: true,
  imageUrl: null,
  createdAt: "2026-07-12T12:00:00.000Z",
  updatedAt: "2026-07-12T12:00:00.000Z",
};
const redemption: AdminRedemption = {
  id: "redemption-1",
  userId: "user-1",
  rewardId: reward.id,
  pointsSpent: 100,
  status: "PENDING",
  user: { id: "user-1", name: "Ana Silva", email: "ana@example.com" },
  reward,
  createdAt: "2026-07-12T12:00:00.000Z",
  updatedAt: "2026-07-12T12:00:00.000Z",
};

describe("RedemptionHistory audited transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      items: [redemption],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it("preserva reason em erro de entrega e limpa ao trocar para cancelamento", async () => {
    deliverMock.mockRejectedValueOnce(new ApiError("Falha na entrega", 400));
    cancelMock.mockResolvedValueOnce({ ...redemption, status: "CANCELLED" });
    const user = userEvent.setup();
    renderWithQueryClient(
      <RedemptionHistory
        rewards={[]}
        optionsLoading={false}
        optionsError={false}
        onRetryOptions={vi.fn()}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Marcar entregue" }),
    );
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Camiseta · Ana Silva")).toBeVisible();
    await user.type(
      within(dialog).getByLabelText("Motivo"),
      "Entrega presencial",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar entrega" }),
    );
    await waitFor(() =>
      expect(deliverMock).toHaveBeenCalledWith("redemption-1", {
        reason: "Entrega presencial",
      }),
    );
    expect(within(dialog).getByLabelText("Motivo")).toHaveValue(
      "Entrega presencial",
    );

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar pedido" }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Motivo")).toHaveValue("");
    await user.type(
      within(dialog).getByLabelText("Motivo"),
      "Pedido duplicado",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar cancelamento" }),
    );
    await waitFor(() =>
      expect(cancelMock).toHaveBeenCalledWith("redemption-1", {
        reason: "Pedido duplicado",
      }),
    );
  });
});
