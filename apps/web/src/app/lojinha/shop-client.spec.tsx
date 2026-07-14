import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMe } from "@/hooks/use-auth";
import { redeemReward, fetchRewards } from "@/features/rewards/rewards.service";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { ShopClient } from "./shop-client";

vi.mock("@/hooks/use-auth", () => ({ useMe: vi.fn() }));
vi.mock("@/features/rewards/rewards.service", () => ({
  fetchRewards: vi.fn(),
  redeemReward: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/logout-button", () => ({ LogoutButton: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const toast = await import("sonner").then((module) => module.toast);
const useMeMock = vi.mocked(useMe);
const fetchRewardsMock = vi.mocked(fetchRewards);
const redeemRewardMock = vi.mocked(redeemReward);

const participant = {
  id: "user-1",
  name: "Ana",
  cpf: "12345678900",
  email: "ana@example.com",
  role: "PARTICIPANT" as const,
  points: 100,
  xp: 100,
  level: 1,
  isActive: true,
  lastLoginAt: null,
  createdAt: "2026-07-12T12:00:00.000Z",
};

const reward = {
  id: "reward-1",
  name: "Camiseta",
  description: "Camiseta Semcomp",
  costInPoints: 50,
  stock: 2,
  isActive: true,
  imageUrl: null,
  createdAt: "2026-07-12T12:00:00.000Z",
  updatedAt: "2026-07-12T12:00:00.000Z",
};

describe("ShopClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMeMock.mockReturnValue({
      data: participant,
      error: null,
      isLoading: false,
    } as ReturnType<typeof useMe>);
    fetchRewardsMock.mockResolvedValue([reward]);
  });

  it("resgata a recompensa confirmada e atualiza os dados em cache", async () => {
    redeemRewardMock.mockResolvedValue({
      id: "redemption-1",
      userId: participant.id,
      rewardId: reward.id,
      pointsSpent: reward.costInPoints,
      status: "PENDING",
      user: { id: participant.id, name: participant.name, email: participant.email },
      reward,
      createdAt: "2026-07-12T12:00:00.000Z",
      updatedAt: "2026-07-12T12:00:00.000Z",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<ShopClient />);
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Resgatar" }));

    await waitFor(() => {
      expect(redeemRewardMock).toHaveBeenCalledWith(reward.id);
      expect(toast.success).toHaveBeenCalledWith("Resgate de Camiseta criado.");
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["me"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["rewards"] });
  });

  it("não resgata quando o participante cancela a confirmação", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderWithQueryClient(<ShopClient />);

    await user.click(await screen.findByRole("button", { name: "Resgatar" }));

    expect(redeemRewardMock).not.toHaveBeenCalled();
  });

  it("informa a falha sem exibir sucesso", async () => {
    redeemRewardMock.mockRejectedValue(new ApiError("Saldo insuficiente.", 400));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderWithQueryClient(<ShopClient />);

    await user.click(await screen.findByRole("button", { name: "Resgatar" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Saldo insuficiente.");
    });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
