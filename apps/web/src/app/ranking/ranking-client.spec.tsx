import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRanking } from "@/features/ranking/ranking.service";
import type { RankingResponse } from "@/features/ranking/ranking.types";
import type { User, UserRole } from "@/features/users/users.types";
import { useMe } from "@/hooks/use-auth";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { RankingClient } from "./ranking-client";

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock("@/hooks/use-auth", () => ({ useMe: vi.fn() }));
vi.mock("@/features/ranking/ranking.service", () => ({
  fetchRanking: vi.fn(),
}));
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button type="button">Sair</button>,
}));
vi.mock("@/components/semcomp/brand-logo", () => ({
  BrandLogo: () => <span aria-label="SEMCOMP 2026" role="img" />,
}));

const useMeMock = vi.mocked(useMe);
const fetchRankingMock = vi.mocked(fetchRanking);

const participantRanking: RankingResponse = {
  ranking: [
    { position: 1, name: "Ana Lima", xp: 2450 },
    { position: 2, name: "Caio Luz", xp: 2310 },
    { position: 3, name: "Bia Reis", xp: 2190 },
    { position: 4, name: "Ivo Melo", xp: 2050 },
  ],
  me: { position: 8, name: "Davi Santos", xp: 1840 },
};

function createUser(role: UserRole = "PARTICIPANT"): User {
  return {
    id: `${role.toLowerCase()}-1`,
    name: role === "ADMIN" ? "Admin SEMCOMP" : "Davi Santos",
    cpf: "00000000000",
    email: "davi@example.com",
    role,
    points: 620,
    xp: 1840,
    level: 7,
    isActive: true,
    lastLoginAt: null,
    createdAt: "2026-07-18T12:00:00.000Z",
  };
}

function mockUser(role: UserRole = "PARTICIPANT") {
  useMeMock.mockReturnValue({
    data: createUser(role),
    error: null,
    isLoading: false,
  } as ReturnType<typeof useMe>);
}

describe("RankingClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser();
    fetchRankingMock.mockResolvedValue(participantRanking);
  });

  it("hierarquiza o Top 3, a lista e a posição pessoal no shell compartilhado", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<RankingClient />);

    expect(
      await screen.findByRole("heading", {
        name: "Sua posição na jornada.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ranking" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const podium = screen.getByTestId("ranking-podium");
    expect(within(podium).getByText("#01")).toBeInTheDocument();
    expect(within(podium).getByText("#02")).toBeInTheDocument();
    expect(within(podium).getByText("#03")).toBeInTheDocument();
    expect(screen.getByText("#04")).toBeInTheDocument();
    expect(screen.getByText("#08")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hoje" }));
    await waitFor(() =>
      expect(fetchRankingMock).toHaveBeenCalledWith(10, "daily"),
    );
  });

  it("renderiza apenas as posições disponíveis quando há menos de três", async () => {
    fetchRankingMock.mockResolvedValue({
      ranking: [{ position: 1, name: "Ana Lima", xp: 450 }],
      me: null,
    });
    renderWithQueryClient(<RankingClient />);

    const podium = await screen.findByTestId("ranking-podium");
    expect(within(podium).getByText("#01")).toBeInTheDocument();
    expect(within(podium).queryByText("#02")).not.toBeInTheDocument();
    expect(
      screen.getByText("Participe para entrar no placar."),
    ).toBeInTheDocument();
  });

  it("orienta o participante quando o ranking ainda está vazio", async () => {
    fetchRankingMock.mockResolvedValue({ ranking: [], me: null });
    renderWithQueryClient(<RankingClient />);

    expect(
      await screen.findByText("Nenhum participante pontuou ainda."),
    ).toBeInTheDocument();
  });

  it("permite tentar novamente após uma falha recuperável", async () => {
    const user = userEvent.setup();
    fetchRankingMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(participantRanking);
    renderWithQueryClient(<RankingClient />);

    await user.click(
      await screen.findByRole("button", { name: "Tentar novamente" }),
    );

    expect(await screen.findByText("Ana Lima")).toBeInTheDocument();
    expect(fetchRankingMock).toHaveBeenCalledTimes(2);
  });

  it("redireciona autenticação expirada para o login", async () => {
    fetchRankingMock.mockRejectedValue(new ApiError("Sessão expirada", 401));
    renderWithQueryClient(<RankingClient />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
  });

  it("preserva o modo observador administrativo fora do shell participante", async () => {
    mockUser("ADMIN");
    renderWithQueryClient(<RankingClient />);

    expect(await screen.findByText("Modo observador")).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Navegação principal" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Voltar ao painel" }),
    ).toBeInTheDocument();
  });
});
