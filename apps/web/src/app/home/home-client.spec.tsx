import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRanking } from "@/features/ranking/ranking.service";
import { useMe } from "@/hooks/use-auth";
import { renderWithQueryClient } from "@/test/render";
import { HomeClient } from "./home-client";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
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

describe("HomeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchRankingMock.mockResolvedValue({
      ranking: [],
      me: { position: 8, name: "Davi Santos", xp: 1840 },
    });
    useMeMock.mockReturnValue({
      data: {
        id: "participant-1",
        name: "Davi Santos",
        cpf: "00000000000",
        email: "davi@example.com",
        role: "PARTICIPANT",
        points: 620,
        xp: 1840,
        level: 7,
        isActive: true,
        lastLoginAt: null,
        createdAt: "2026-07-18T12:00:00.000Z",
      },
      error: null,
      isLoading: false,
    } as ReturnType<typeof useMe>);
  });

  it("apresenta a jornada e somente dados reais do participante", async () => {
    const user = userEvent.setup();
    const { container } = renderWithQueryClient(<HomeClient />);

    expect(
      screen.getByRole("heading", {
        name: "Sua jornada está em movimento.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("1.840 XP")).toBeInTheDocument();
    expect(screen.getByText("620 PTS")).toBeInTheDocument();
    expect(screen.getByText("jornada // SEMCOMP 2026")).toBeInTheDocument();
    expect(screen.getByText("Nível atual: 07")).toHaveClass("sr-only");
    expect(screen.queryByText(/jornada \/\/ nível/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Progresso")).not.toBeInTheDocument();
    expect(screen.getByText("Rumo ao nível 08")).toBeInTheDocument();
    expect(screen.getByText("40/100 XP nesta etapa")).toBeInTheDocument();
    expect(screen.getByText("60 XP restantes")).toBeInTheDocument();
    expect(await screen.findByText("#08")).toBeInTheDocument();
    expect(container.querySelector(".journey-hero")).toBeInTheDocument();
    const orbit = screen.getByTestId("journey-orbit");
    expect(orbit).toHaveAttribute("aria-hidden", "true");
    expect(orbit).not.toHaveClass("hidden");
    expect(
      screen
        .getAllByRole("link", { name: /Ranking/ })
        .every((link) => link.getAttribute("href") === "/ranking"),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: /Lojinha/ })
        .every((link) => link.getAttribute("href") === "/lojinha"),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Resgatar código" }));
    expect(
      screen.getByRole("dialog", { name: "Digite o código" }),
    ).toBeInTheDocument();
    expect(fetchRankingMock).toHaveBeenCalledWith(1, "all");
  });

  it("explica a próxima meta quando a etapa ainda não tem XP", () => {
    useMeMock.mockReturnValue({
      data: {
        id: "participant-1",
        name: "Davi Santos",
        cpf: "00000000000",
        email: "davi@example.com",
        role: "PARTICIPANT",
        points: 620,
        xp: 1800,
        level: 7,
        isActive: true,
        lastLoginAt: null,
        createdAt: "2026-07-18T12:00:00.000Z",
      },
      error: null,
      isLoading: false,
    } as ReturnType<typeof useMe>);

    renderWithQueryClient(<HomeClient />);

    expect(screen.getByText("0/100 XP nesta etapa")).toBeInTheDocument();
    expect(screen.getByText("100 XP restantes")).toBeInTheDocument();
    expect(screen.getByText("Rumo ao nível 08")).toBeInTheDocument();
  });
});
