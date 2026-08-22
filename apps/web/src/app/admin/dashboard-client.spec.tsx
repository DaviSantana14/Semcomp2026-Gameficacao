import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminDashboard } from "@/features/dashboard/dashboard.service";
import {
  fetchPresenceHistory,
  fetchPresenceOverview,
} from "@/features/presence/presence.service";
import { renderWithQueryClient } from "@/test/render";
import { DashboardClient } from "./dashboard-client";

vi.mock("@/features/dashboard/dashboard.service", () => ({
  fetchAdminDashboard: vi.fn(),
}));
vi.mock("@/features/presence/presence.service", () => ({
  downloadPresenceCsv: vi.fn(),
  fetchPresenceHistory: vi.fn(),
  fetchPresenceOverview: vi.fn(),
  getDefaultPresenceRange: vi.fn(() => ({
    from: "2026-08-16",
    to: "2026-08-23",
  })),
}));

const fetchAdminDashboardMock = vi.mocked(fetchAdminDashboard);
const fetchPresenceHistoryMock = vi.mocked(fetchPresenceHistory);
const fetchPresenceOverviewMock = vi.mocked(fetchPresenceOverview);

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
    fetchPresenceOverviewMock.mockResolvedValue({
      status: "LIVE",
      timezone: "America/Sao_Paulo",
      heartbeatIntervalSeconds: 60,
      onlineWindowSeconds: 120,
      lastCollectedAt: "2026-08-22T09:00:00-03:00",
      onlineNow: 18,
      registeredParticipants: 842,
      uniqueParticipantsEverLogged: 719,
      monitoredDays: 7,
      today: {
        operationalDate: "2026-08-22",
        peakOnlineParticipants: 32,
        peakAt: "2026-08-22T08:30:00-03:00",
        registeredParticipantsAtPeak: 790,
        uniqueParticipantLogins: 410,
        newParticipantRegistrations: 12,
      },
      overallPeak: {
        operationalDate: "2026-08-20",
        onlineParticipants: 56,
        observedAt: "2026-08-20T14:00:00-03:00",
        registeredParticipantsAtPeak: 801,
      },
    });
    fetchPresenceHistoryMock.mockResolvedValue({
      period: { from: "2026-08-16", to: "2026-08-23" },
      timezone: "America/Sao_Paulo",
      items: [],
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
    expect(
      await screen.findByText("Presença dos participantes"),
    ).toBeInTheDocument();
  });

  it("mantém os cards operacionais quando a presença falha", async () => {
    fetchPresenceOverviewMock.mockRejectedValueOnce(
      new Error("Presença indisponível."),
    );

    renderWithQueryClient(<DashboardClient />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Presença indisponível.",
    );
    expect(screen.getByText("18.400")).toBeInTheDocument();
    expect(screen.getByText("Kit SEMCOMP 2026")).toBeInTheDocument();
  });
});
