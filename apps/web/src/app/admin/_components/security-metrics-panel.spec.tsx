import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchSecurityMetricsOverview,
  type SecurityMetricsOverview,
} from "@/features/security/security-metrics.service";
import { renderWithQueryClient } from "@/test/render";
import { SecurityMetricsPanel } from "./security-metrics-panel";

vi.mock("@/features/security/security-metrics.service", () => ({
  fetchSecurityMetricsOverview: vi.fn(),
}));

const fetchSecurityMetricsOverviewMock = vi.mocked(
  fetchSecurityMetricsOverview,
);

const overview: SecurityMetricsOverview = {
  status: "NORMAL",
  lastFlushedMinute: "2026-08-23T12:00:00.000Z",
  periods: {
    fiveMinutes: { unauthorized: 2, forbidden: 1, rateLimited: 0 },
    oneHour: { unauthorized: 5, forbidden: 2, rateLimited: 1 },
    twentyFourHours: { unauthorized: 11, forbidden: 4, rateLimited: 2 },
  },
  thresholds: {
    unauthorized: 20,
    forbidden: 10,
    rateLimited: 5,
    windowMinutes: 5,
  },
};

describe("SecurityMetricsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSecurityMetricsOverviewMock.mockResolvedValue(overview);
  });

  it("renders one accessible card per HTTP status with all requested periods", async () => {
    renderWithQueryClient(<SecurityMetricsPanel />);

    const panel = await screen.findByRole("region", {
      name: "Métricas de segurança",
    });

    expect(within(panel).getByText("NORMAL")).toBeVisible();

    const unauthorized = within(panel).getByRole("article", {
      name: "Não autorizado (401)",
    });
    expect(within(unauthorized).getByText("2")).toBeVisible();
    expect(within(unauthorized).getByText(/limiar: 20/i)).toBeVisible();
    expect(within(unauthorized).getByText(/1 h: 5/)).toBeVisible();
    expect(within(unauthorized).getByText(/24 h: 11/)).toBeVisible();

    expect(
      within(panel).getByRole("article", { name: "Proibido (403)" }),
    ).toHaveTextContent("1");
    expect(
      within(panel).getByRole("article", { name: "Limite de requisições (429)" }),
    ).toHaveTextContent("0");
    expect(within(panel).getByText(/última atualização/i)).toBeVisible();
  });

  it("shows attention at threshold equality and degraded when freshness is degraded", async () => {
    fetchSecurityMetricsOverviewMock.mockResolvedValueOnce({
      ...overview,
      status: "ATTENTION",
      periods: {
        fiveMinutes: { unauthorized: 20, forbidden: 10, rateLimited: 5 },
        oneHour: { unauthorized: 20, forbidden: 10, rateLimited: 5 },
        twentyFourHours: { unauthorized: 20, forbidden: 10, rateLimited: 5 },
      },
    });

    const { unmount } = renderWithQueryClient(<SecurityMetricsPanel />);
    const attentionPanel = await screen.findByRole("region", {
      name: "Métricas de segurança",
    });
    expect(within(attentionPanel).getByText("ATENÇÃO")).toBeVisible();
    expect(within(attentionPanel).getAllByText(/limiar atingido/i)).toHaveLength(
      3,
    );
    unmount();

    fetchSecurityMetricsOverviewMock.mockResolvedValueOnce({
      ...overview,
      status: "DEGRADED",
      lastFlushedMinute: "2026-08-23T11:56:00.000Z",
    });
    renderWithQueryClient(<SecurityMetricsPanel />);
    const degradedPanel = await screen.findByRole("region", {
      name: "Métricas de segurança",
    });
    expect(within(degradedPanel).getByText("DEGRADADO")).toBeVisible();
    expect(within(degradedPanel).getByText(/dados atrasados/i)).toBeVisible();
  });

  it("shows loading status and resolves into the panel", async () => {
    let resolve!: (value: SecurityMetricsOverview) => void;
    fetchSecurityMetricsOverviewMock.mockImplementationOnce(
      () => new Promise((res) => (resolve = res)),
    );

    renderWithQueryClient(<SecurityMetricsPanel />);

    expect(
      screen.getByRole("status", { name: "Carregando métricas de segurança" }),
    ).toBeInTheDocument();

    resolve(overview);
    expect(
      await screen.findByRole("region", { name: "Métricas de segurança" }),
    ).toBeVisible();
  });

  it("shows an isolated error with a retry action", async () => {
    fetchSecurityMetricsOverviewMock.mockRejectedValueOnce(
      new Error("Segurança indisponível."),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<SecurityMetricsPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Segurança indisponível.",
    );
    fetchSecurityMetricsOverviewMock.mockResolvedValueOnce(overview);
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("region", { name: "Métricas de segurança" }),
    ).toBeVisible();
  });

  it("refreshes independently in the background every sixty seconds", async () => {
    vi.useFakeTimers();
    try {
      renderWithQueryClient(<SecurityMetricsPanel />);
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchSecurityMetricsOverviewMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(fetchSecurityMetricsOverviewMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
