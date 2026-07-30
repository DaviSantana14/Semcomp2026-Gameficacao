import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminDashboard } from "@/features/dashboard/dashboard.service";
import { renderWithQueryClient } from "@/test/render";
import { DashboardClient } from "./dashboard-client";

vi.mock("@/features/dashboard/dashboard.service", () => ({
  fetchAdminDashboard: vi.fn(),
}));

const fetchAdminDashboardMock = vi.mocked(fetchAdminDashboard);

describe("DashboardClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAdminDashboardMock.mockResolvedValue({
      participants: { active: 719, inactive: 123, total: 842 },
      activity: { pointsIssued: 18_400, redemptions: 1_126 },
      codes: {
        reusableActive: 12,
        reusableTotal: 18,
        uniqueAvailable: 530,
        uniqueTotal: 1_200,
        uniqueUsed: 670,
      },
      shop: {
        outOfStock: 2,
        pendingRedemptions: 1,
        rewardsActive: 18,
        rewardsTotal: 22,
      },
      recentPendingRedemptions: [
        {
          id: "redemption-1",
          pointsSpent: 350,
          status: "PENDING",
          createdAt: "2026-07-18T13:00:00.000Z",
          user: { id: "participant-1", name: "Davi Santos" },
          reward: { id: "reward-1", name: "Kit SEMCOMP 2026" },
        },
      ],
    });
  });

  it("apresenta a visão geral operacional com dados reais", async () => {
    renderWithQueryClient(<DashboardClient />);

    expect(
      await screen.findByRole("heading", { name: "Visão geral do evento." }),
    ).toBeInTheDocument();
    expect(screen.getByText("842")).toBeInTheDocument();
    expect(screen.getByText("18.400")).toBeInTheDocument();
    expect(screen.getByText("Kit SEMCOMP 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Gerenciar participantes/ }),
    ).toHaveAttribute("href", "/admin/participantes");
    expect(
      screen.queryByText("Bom trabalho, operador."),
    ).not.toBeInTheDocument();
  });
});
