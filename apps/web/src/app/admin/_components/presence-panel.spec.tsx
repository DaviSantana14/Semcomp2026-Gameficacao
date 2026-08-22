import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPresenceOverview,
  type PresenceOverview,
} from "@/features/presence/presence.service";
import { renderWithQueryClient } from "@/test/render";
import { PresencePanel } from "./presence-panel";

vi.mock("@/features/presence/presence.service", () => ({
  fetchPresenceOverview: vi.fn(),
}));

const fetchPresenceOverviewMock = vi.mocked(fetchPresenceOverview);

const overview: PresenceOverview = {
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
};

describe("PresencePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPresenceOverviewMock.mockResolvedValue(overview);
  });

  it("presents live status, collection window, today, and general metrics", async () => {
    renderWithQueryClient(<PresencePanel />);

    const panel = await screen.findByRole("region", {
      name: "Presença dos participantes",
    });

    expect(within(panel).getByText("AO VIVO")).toBeVisible();
    expect(within(panel).getByText("18")).toBeVisible();
    expect(within(panel).getByText("Pico de hoje")).toBeVisible();
    expect(within(panel).getByText("32")).toBeVisible();
    expect(within(panel).getByText("Pico geral")).toBeVisible();
    expect(within(panel).getByText("56")).toBeVisible();
    expect(
      within(panel).getByText(
        /Consideramos online quem enviou um heartbeat na janela de 120 segundos/i,
      ),
    ).toBeVisible();
    expect(
      within(panel).getByText(/última coleta às 09:00/i),
    ).toBeVisible();
  });

  it("shows loading status and resolves into the panel", async () => {
    let resolve!: (value: PresenceOverview) => void;
    fetchPresenceOverviewMock.mockImplementationOnce(
      () => new Promise((res) => (resolve = res)),
    );
    renderWithQueryClient(<PresencePanel />);

    expect(
      screen.getByRole("status", { name: "Carregando presença" }),
    ).toBeInTheDocument();

    resolve(overview);
    expect(
      await screen.findByRole("region", { name: "Presença dos participantes" }),
    ).toBeVisible();
  });

  it("renders an error with a retry action", async () => {
    fetchPresenceOverviewMock.mockRejectedValueOnce(
      new Error("Presença indisponível."),
    );
    renderWithQueryClient(<PresencePanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Presença indisponível.",
    );
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeEnabled();
  });

  it("labels stale collection data as degraded instead of live", async () => {
    fetchPresenceOverviewMock.mockResolvedValueOnce({
      ...overview,
      lastCollectedAt: "2026-08-22T08:55:00-03:00",
      status: "DEGRADED",
    });
    renderWithQueryClient(<PresencePanel />);

    const panel = await screen.findByRole("region", {
      name: "Presença dos participantes",
    });
    expect(within(panel).getByText("DEGRADADO")).toBeVisible();
    expect(within(panel).queryByText("AO VIVO")).not.toBeInTheDocument();
  });

  it("refreshes the overview in the background every thirty seconds", async () => {
    vi.useFakeTimers();
    try {
      renderWithQueryClient(<PresencePanel />);
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchPresenceOverviewMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);

      expect(fetchPresenceOverviewMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
