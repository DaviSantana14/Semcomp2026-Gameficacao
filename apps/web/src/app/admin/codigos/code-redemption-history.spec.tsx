import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadCodeRedemptionsExport,
  fetchAdminActions,
  fetchCodeRedemptions,
  fetchCodeRedemptionsExportCount,
} from "@/features/actions/actions.service";
import { renderWithQueryClient } from "@/test/render";
import { CodeRedemptionHistory } from "./code-redemption-history";

vi.mock("@/features/actions/actions.service", () => ({
  downloadCodeRedemptionsExport: vi.fn(),
  fetchAdminActions: vi.fn(),
  fetchCodeRedemptions: vi.fn(),
  fetchCodeRedemptionsExportCount: vi.fn(),
}));

const actionsMock = vi.mocked(fetchAdminActions);
const redemptionsMock = vi.mocked(fetchCodeRedemptions);
const exportCountMock = vi.mocked(fetchCodeRedemptionsExportCount);
const downloadExportMock = vi.mocked(downloadCodeRedemptionsExport);

const redemption = {
  id: "redemption-1",
  participant: {
    id: "participant-1",
    name: "Ana Silva",
    email: "ana@example.com",
  },
  action: { id: "action-1", name: "Check-in" },
  method: "CLAIM_CODE" as const,
  code: "K7XM…9N2P",
  points: 10,
  xpDelta: 5,
  createdAt: "2026-08-23T14:30:00.000Z",
};

const page = {
  items: [redemption],
  meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

describe("CodeRedemptionHistory", () => {
  beforeEach(() => {
    actionsMock.mockReset();
    redemptionsMock.mockReset();
    exportCountMock.mockReset();
    downloadExportMock.mockReset();
    actionsMock.mockResolvedValue({
      items: [{ id: "action-1", name: "Check-in" } as never],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    redemptionsMock.mockResolvedValue(page);
    exportCountMock.mockResolvedValue({ count: 1, maxRows: 50_000 });
    downloadExportMock.mockResolvedValue(undefined);
  });

  it("shows the participant, method and masked code", async () => {
    renderWithQueryClient(<CodeRedemptionHistory />);

    expect(await screen.findByText("Ana Silva")).toBeVisible();
    const article = screen.getByRole("article");
    expect(within(article).getByText("Check-in")).toBeVisible();
    expect(within(article).getByText("Código de uso único")).toBeVisible();
    expect(within(article).getByText("K7XM…9N2P")).toBeVisible();
    expect(within(article).queryByText("K7XM-9N2P")).not.toBeInTheDocument();
    expect(within(article).getByText("+10 PTS")).toBeVisible();
    expect(within(article).getByText("+5 XP")).toBeVisible();
  });

  it("validates dates, applies filters and exports without pagination", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<CodeRedemptionHistory />);
    await screen.findByText("Ana Silva");

    fireEvent.change(screen.getByLabelText("Data inicial"), {
      target: { value: "2026-08-24" },
    });
    fireEvent.change(screen.getByLabelText("Data final exclusiva"), {
      target: { value: "2026-08-23" },
    });
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A data inicial deve ser anterior à data final exclusiva.",
    );

    fireEvent.change(screen.getByLabelText("Data inicial"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Data final exclusiva"), {
      target: { value: "" },
    });
    await user.type(screen.getByLabelText("Participante"), "Ana");
    await user.selectOptions(screen.getByLabelText("Método"), "claim_code");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() =>
      expect(redemptionsMock).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        search: "Ana",
        method: "claim_code",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Exportar resgates" }));
    expect(await screen.findByText("1 registro")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() =>
      expect(exportCountMock).toHaveBeenCalledWith({
        search: "Ana",
        method: "claim_code",
      }),
    );
    expect(downloadExportMock).toHaveBeenCalledWith({
      search: "Ana",
      method: "claim_code",
    });
  });

  it("keeps list failures and empty state retryable", async () => {
    redemptionsMock
      .mockRejectedValueOnce(new Error("Resgates indisponíveis."))
      .mockResolvedValueOnce({
        items: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    const user = userEvent.setup();
    renderWithQueryClient(<CodeRedemptionHistory />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Resgates indisponíveis.",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByText("Nenhum resgate por código encontrado."),
    ).toBeVisible();
  });
});
