import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReward,
  fetchAdminRedemptions,
  fetchAdminRewards,
  updateReward,
} from "@/features/rewards/rewards.service";
import type { AdminReward } from "@/features/rewards/rewards.types";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { ShopAdminClient } from "./shop-admin-client";

vi.mock("@/features/rewards/rewards.service", () => ({
  cancelRedemption: vi.fn(),
  createReward: vi.fn(),
  deliverRedemption: vi.fn(),
  fetchAdminRedemptions: vi.fn(),
  fetchAdminRewards: vi.fn(),
  updateReward: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const rewardsMock = vi.mocked(fetchAdminRewards);
const redemptionsMock = vi.mocked(fetchAdminRedemptions);
const updateMock = vi.mocked(updateReward);
const createMock = vi.mocked(createReward);
const reward: AdminReward = {
  id: "reward-1",
  name: "Camiseta",
  description: "Preta",
  costInPoints: 100,
  stock: 3,
  isActive: true,
  imageUrl: null,
  createdAt: "2026-07-12T12:00:00.000Z",
  updatedAt: "2026-07-12T12:00:00.000Z",
  redemptionCounts: { PENDING: 0, DELIVERED: 0, CANCELLED: 0 },
};

describe("ShopAdminClient audited reward status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rewardsMock.mockResolvedValue({
      items: [reward],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    redemptionsMock.mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true,
    });
  });

  it("envia status com contexto e preserva reason no erro", async () => {
    updateMock.mockRejectedValueOnce(new ApiError("Falha controlada", 400));
    const user = userEvent.setup();
    renderWithQueryClient(<ShopAdminClient />);

    await user.click(await screen.findByRole("button", { name: "Desativar" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Recompensa Camiseta")).toBeVisible();
    await user.type(
      within(dialog).getByLabelText("Motivo"),
      "Catálogo pausado",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar alteração" }),
    );

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("reward-1", {
        isActive: false,
        reason: "Catálogo pausado",
      }),
    );
    expect(within(dialog).getByLabelText("Motivo")).toHaveValue(
      "Catálogo pausado",
    );
  });

  it("bloqueia abrir outra recompensa enquanto create está pending", async () => {
    createMock.mockImplementationOnce(() => new Promise(() => undefined));
    const user = userEvent.setup();
    renderWithQueryClient(<ShopAdminClient />);

    await user.type(screen.getByLabelText("Nome"), "Boné");
    await user.type(screen.getByLabelText("Motivo"), "Inclusão no catálogo");
    await user.click(screen.getByRole("button", { name: "Criar recompensa" }));

    expect(
      await screen.findByRole("button", { name: "Editar" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Desativar" })).toBeDisabled();
  });

  it("edita pelo formulário, preserva o motivo no erro e o reinicia em nova operação", async () => {
    let rejectUpdate!: (error: Error) => void;
    updateMock.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectUpdate = reject;
        }),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<ShopAdminClient />);

    await user.click(await screen.findByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Nome"));
    await user.type(screen.getByLabelText("Nome"), "  Camiseta premium  ");
    await user.type(
      screen.getByLabelText("Motivo"),
      "  Ajuste solicitado pelo estoque  ",
    );
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(updateMock).toHaveBeenCalledWith("reward-1", {
      name: "Camiseta premium",
      description: "Preta",
      costInPoints: 100,
      stock: 3,
      imageUrl: null,
      reason: "Ajuste solicitado pelo estoque",
    });
    expect(screen.getByLabelText("Nome")).toBeDisabled();
    expect(screen.getByLabelText("Motivo")).toBeDisabled();

    rejectUpdate(new ApiError("Falha controlada", 400));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salvar alterações" }),
      ).toBeEnabled(),
    );
    expect(screen.getByLabelText("Motivo")).toHaveValue(
      "  Ajuste solicitado pelo estoque  ",
    );

    await user.click(screen.getByRole("button", { name: "Cancelar edição" }));
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Motivo")).toHaveValue("");
    expect(screen.getByLabelText("Nome")).toHaveValue("Camiseta");
  });
});
