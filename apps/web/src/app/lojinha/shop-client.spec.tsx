import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRewards, redeemReward } from "@/features/rewards/rewards.service";
import type { Reward } from "@/features/rewards/rewards.types";
import { useMe } from "@/hooks/use-auth";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { ShopClient } from "./shop-client";

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("@/hooks/use-auth", () => ({ useMe: vi.fn() }));
vi.mock("@/features/rewards/rewards.service", () => ({
  fetchRewards: vi.fn(),
  redeemReward: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button type="button">Sair</button>,
}));
vi.mock("@/components/semcomp/brand-logo", () => ({
  BrandLogo: () => <span aria-label="SEMCOMP 2026" role="img" />,
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const toast = await import("sonner").then((module) => module.toast);
const useMeMock = vi.mocked(useMe);
const fetchRewardsMock = vi.mocked(fetchRewards);
const redeemRewardMock = vi.mocked(redeemReward);

const participant = {
  id: "user-1",
  name: "Ana Lima",
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

function createReward(
  overrides: Partial<Reward> & Pick<Reward, "id" | "name">,
): Reward {
  return {
    description: "Recompensa oficial da SEMCOMP",
    costInPoints: 50,
    stock: 2,
    isActive: true,
    imageUrl: null,
    createdAt: "2026-07-12T12:00:00.000Z",
    updatedAt: "2026-07-12T12:00:00.000Z",
    ...overrides,
  };
}

const reward = createReward({ id: "reward-1", name: "Camiseta" });

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

  it("apresenta saldo, shell e estados explícitos das recompensas", async () => {
    fetchRewardsMock.mockResolvedValue([
      reward,
      createReward({
        id: "reward-2",
        name: "Caneca",
        costInPoints: 150,
      }),
      createReward({ id: "reward-3", name: "Adesivo", stock: 0 }),
    ]);
    renderWithQueryClient(<ShopClient />);

    expect(
      await screen.findByRole("heading", {
        name: "Transforme pontos em conquistas.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lojinha" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("100 PTS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resgatar" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Saldo insuficiente" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Esgotado" })).toBeDisabled();
  });

  it("confirma o resgate no diálogo e atualiza os dados em cache", async () => {
    redeemRewardMock.mockResolvedValue({
      id: "redemption-1",
      userId: participant.id,
      rewardId: reward.id,
      pointsSpent: reward.costInPoints,
      status: "PENDING",
      user: {
        id: participant.id,
        name: participant.name,
        email: participant.email,
      },
      reward,
      createdAt: "2026-07-12T12:00:00.000Z",
      updatedAt: "2026-07-12T12:00:00.000Z",
    });
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<ShopClient />);
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Resgatar" }));
    expect(
      screen.getByRole("dialog", { name: "Confirmar resgate" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Saldo após o resgate")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Resgatar por 50 PTS" }),
    );

    await waitFor(() => {
      expect(redeemRewardMock).toHaveBeenCalledWith(reward.id);
      expect(toast.success).toHaveBeenCalledWith(
        "Resgate de Camiseta criado. Retire no evento.",
      );
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["me"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["rewards"] });
  });

  it("cancela a confirmação sem iniciar a mutação", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ShopClient />);

    await user.click(await screen.findByRole("button", { name: "Resgatar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(redeemRewardMock).not.toHaveBeenCalled();
  });

  it("mantém o diálogo aberto e mostra a falha de resgate em contexto", async () => {
    redeemRewardMock.mockRejectedValue(
      new ApiError("Saldo insuficiente.", 400),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<ShopClient />);

    await user.click(await screen.findByRole("button", { name: "Resgatar" }));
    await user.click(
      screen.getByRole("button", { name: "Resgatar por 50 PTS" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Saldo insuficiente.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("trata catálogo vazio e permite tentar novamente após erro", async () => {
    const user = userEvent.setup();
    fetchRewardsMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<ShopClient />);

    await user.click(
      await screen.findByRole("button", { name: "Tentar novamente" }),
    );

    expect(
      await screen.findByText("Nenhuma recompensa está disponível agora."),
    ).toBeInTheDocument();
  });

  it("preserva os redirecionamentos por autenticação e papel", async () => {
    useMeMock.mockReturnValue({
      data: undefined,
      error: new ApiError("Sessão expirada", 401),
      isLoading: false,
    } as ReturnType<typeof useMe>);
    const { unmount } = renderWithQueryClient(<ShopClient />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
    unmount();

    vi.clearAllMocks();
    useMeMock.mockReturnValue({
      data: { ...participant, role: "ADMIN" },
      error: null,
      isLoading: false,
    } as ReturnType<typeof useMe>);
    renderWithQueryClient(<ShopClient />);
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/admin/lojinha"),
    );
  });
});
