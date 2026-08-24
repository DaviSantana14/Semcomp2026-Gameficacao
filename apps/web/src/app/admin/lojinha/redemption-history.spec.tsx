import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelRedemption,
  deliverRedemption,
  fetchAdminRedemptions,
} from "@/features/rewards/rewards.service";
import {
  downloadRedemptionsExport,
  fetchRedemptionsExportCount,
} from "@/features/exports/exports.service";
import type { AdminRedemption } from "@/features/rewards/rewards.types";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { RedemptionHistory } from "./redemption-history";

vi.mock("@/features/rewards/rewards.service", () => ({
  cancelRedemption: vi.fn(),
  deliverRedemption: vi.fn(),
  fetchAdminRedemptions: vi.fn(),
}));
vi.mock("@/features/exports/exports.service", () => ({
  downloadRedemptionsExport: vi.fn(),
  fetchRedemptionsExportCount: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const fetchMock = vi.mocked(fetchAdminRedemptions);
const deliverMock = vi.mocked(deliverRedemption);
const cancelMock = vi.mocked(cancelRedemption);
const exportCountMock = vi.mocked(fetchRedemptionsExportCount);
const exportDownloadMock = vi.mocked(downloadRedemptionsExport);
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
  redemptionCounts: { PENDING: 1, DELIVERED: 0, CANCELLED: 0 },
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
    exportCountMock.mockResolvedValue({ count: 1, maxRows: 50_000 });
    exportDownloadMock.mockResolvedValue(undefined);
  });

  it("expõe a fila como região de retiradas", () => {
    renderWithQueryClient(
      <RedemptionHistory
        rewards={[]}
        optionsLoading={false}
        optionsError={false}
        onRetryOptions={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "Retiradas" })).toBeVisible();
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

  it("applies shop search and dates before sending them to list and export", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <RedemptionHistory
        rewards={[reward]}
        optionsLoading={false}
        optionsError={false}
        onRetryOptions={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Buscar participante"), "rascunho");
    await user.type(screen.getByLabelText("Data inicial"), "2026-08-22");
    await user.type(screen.getByLabelText("Data final"), "2026-08-23");
    await user.click(screen.getByRole("button", { name: "Exportar pedidos" }));
    await user.click(
      await screen.findByRole("button", { name: "Exportar CSV" }),
    );

    expect(exportCountMock).toHaveBeenCalledWith({
      search: undefined,
      status: "all",
      rewardId: undefined,
      from: undefined,
      to: undefined,
    });
    expect(exportDownloadMock).toHaveBeenCalledWith({
      search: undefined,
      status: "all",
      rewardId: undefined,
      from: undefined,
      to: undefined,
    });

    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith({
        page: 1,
        limit: 10,
        status: "all",
        search: "rascunho",
        rewardId: undefined,
        from: "2026-08-22",
        to: "2026-08-23",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Exportar pedidos" }));
    await user.click(
      await screen.findByRole("button", { name: "Exportar CSV" }),
    );
    expect(exportCountMock).toHaveBeenLastCalledWith({
      search: "rascunho",
      status: "all",
      rewardId: undefined,
      from: "2026-08-22",
      to: "2026-08-23",
    });
    expect(exportDownloadMock).toHaveBeenLastCalledWith({
      search: "rascunho",
      status: "all",
      rewardId: undefined,
      from: "2026-08-22",
      to: "2026-08-23",
    });
  });
});
