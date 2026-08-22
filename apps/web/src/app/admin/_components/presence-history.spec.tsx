import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadPresenceCsv,
  fetchPresenceHistory,
  type PresenceHistory as PresenceHistoryResponse,
} from "@/features/presence/presence.service";
import { renderWithQueryClient } from "@/test/render";
import { PresenceHistory } from "./presence-history";

vi.mock("@/features/presence/presence.service", () => ({
  downloadPresenceCsv: vi.fn(),
  fetchPresenceHistory: vi.fn(),
  getDefaultPresenceRange: vi.fn(() => ({
    from: "2026-08-16",
    to: "2026-08-23",
  })),
}));

const fetchPresenceHistoryMock = vi.mocked(fetchPresenceHistory);
const downloadPresenceCsvMock = vi.mocked(downloadPresenceCsv);

const history: PresenceHistoryResponse = {
  period: { from: "2026-08-16", to: "2026-08-23" },
  timezone: "America/Sao_Paulo",
  items: [
    {
      operationalDate: "2026-08-20",
      onlineAtLastCollection: 14,
      lastCollectedAt: "2026-08-20T18:00:00-03:00",
      peakOnlineParticipants: 21,
      peakAt: "2026-08-20T14:00:00-03:00",
      registeredParticipantsAtPeak: 30,
      uniqueParticipantLogins: 45,
      newParticipantRegistrations: 3,
    },
  ],
};

describe("PresenceHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPresenceHistoryMock.mockResolvedValue(history);
    downloadPresenceCsvMock.mockResolvedValue(undefined);
  });

  it("loads the default seven-day range into labelled date filters", async () => {
    renderWithQueryClient(<PresenceHistory />);

    expect(
      await screen.findByRole("table", { name: "Histórico diário de presença" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Data inicial")).toHaveValue("2026-08-16");
    expect(screen.getByLabelText("Data final")).toHaveValue("2026-08-23");
    expect(screen.getByRole("columnheader", { name: "Dia" })).toHaveAttribute(
      "scope",
      "col",
    );
    expect(screen.getByText("20/08/2026")).toBeInTheDocument();
  });

  it("validates date order before applying a new range", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<PresenceHistory />);
    await screen.findByRole("table", { name: "Histórico diário de presença" });
    const callsBefore = fetchPresenceHistoryMock.mock.calls.length;

    await user.clear(screen.getByLabelText("Data inicial"));
    await user.type(screen.getByLabelText("Data inicial"), "2026-08-25");
    await user.click(screen.getByRole("button", { name: "Aplicar período" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "A data inicial deve ser anterior à data final.",
    );
    expect(fetchPresenceHistoryMock).toHaveBeenCalledTimes(callsBefore);
  });

  it("keeps the applied range for CSV download while draft filters change", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<PresenceHistory />);
    await screen.findByRole("table", { name: "Histórico diário de presença" });

    await user.clear(screen.getByLabelText("Data inicial"));
    await user.type(screen.getByLabelText("Data inicial"), "2026-08-18");
    await user.click(screen.getByRole("button", { name: "Baixar CSV" }));

    await waitFor(() =>
      expect(downloadPresenceCsvMock).toHaveBeenCalledWith({
        from: "2026-08-16",
        to: "2026-08-23",
      }),
    );
  });

  it("disables CSV download while the file is being prepared", async () => {
    let resolve!: () => void;
    downloadPresenceCsvMock.mockImplementationOnce(
      () => new Promise((res) => (resolve = res)),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<PresenceHistory />);
    await screen.findByRole("table", { name: "Histórico diário de presença" });

    const button = screen.getByRole("button", { name: "Baixar CSV" });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Preparando CSV…" }),
    ).toBeDisabled();

    resolve();
    await waitFor(() => expect(button).toBeEnabled());
  });

  it("renders an empty state and does not add pagination controls", async () => {
    fetchPresenceHistoryMock.mockResolvedValueOnce({ ...history, items: [] });
    renderWithQueryClient(<PresenceHistory />);

    const table = await screen.findByRole("table", {
      name: "Histórico diário de presença",
    });
    expect(
      within(table).getByText("Nenhum dia monitorado no período."),
    ).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: /paginação/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/granularidade/i)).not.toBeInTheDocument();
  });

  it("shows a retryable history error", async () => {
    fetchPresenceHistoryMock.mockRejectedValueOnce(
      new Error("Histórico indisponível."),
    );
    renderWithQueryClient(<PresenceHistory />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Histórico indisponível.",
    );
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeVisible();
  });
});
