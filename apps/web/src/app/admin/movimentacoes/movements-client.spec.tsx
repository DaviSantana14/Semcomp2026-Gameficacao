import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadMovementsExport,
  fetchMovements,
  fetchMovementsExportCount,
} from "@/features/movements/movements.service";
import { renderWithQueryClient } from "@/test/render";
import { MovementsClient } from "./movements-client";

vi.mock("@/features/movements/movements.service", () => ({
  downloadMovementsExport: vi.fn(),
  fetchMovements: vi.fn(),
  fetchMovementsExportCount: vi.fn(),
}));

const fetchMovementsMock = vi.mocked(fetchMovements);
const fetchExportCountMock = vi.mocked(fetchMovementsExportCount);
const downloadExportMock = vi.mocked(downloadMovementsExport);

const movement = {
  id: "event-1",
  participant: {
    id: "participant-1",
    name: "Ana Silva",
    email: "ana@example.com",
  },
  points: -10,
  xpDelta: 0,
  kind: "DEBIT" as const,
  source: "REWARD_REDEMPTION" as const,
  redemptionMethod: null,
  reference: { type: "REWARD" as const, label: "Caneca SEMCOMP" },
  action: null,
  claimCode: null,
  code: null,
  reward: { id: "reward-1", name: "Caneca SEMCOMP" },
  actor: null,
  auditOperation: null,
  origin: "REWARD" as const,
  isAudited: false,
  description: "Pedido de recompensa",
  reversalOfPointEventId: null,
  reversalPointEventId: null,
  createdAt: "2026-08-23T14:30:00.000Z",
};

const page = {
  items: [movement],
  meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

describe("MovementsClient", () => {
  beforeEach(() => {
    fetchMovementsMock.mockReset();
    fetchExportCountMock.mockReset();
    downloadExportMock.mockReset();
    fetchMovementsMock.mockResolvedValue(page);
    fetchExportCountMock.mockResolvedValue({ count: 1, maxRows: 50_000 });
    downloadExportMock.mockResolvedValue(undefined);
  });

  it("shows operational movement details, including the translated origin", async () => {
    renderWithQueryClient(<MovementsClient />);

    expect(await screen.findByText("Ana Silva")).toBeVisible();
    const article = screen.getByRole("article");
    expect(within(article).getAllByText("Lojinha")).toHaveLength(2);
    expect(within(article).getByText("Caneca SEMCOMP")).toBeVisible();
    expect(within(article).getByText("-10 PTS")).toBeVisible();
    expect(within(article).getByText("0 XP")).toBeVisible();
    expect(within(article).getByText("Pedido de recompensa")).toBeVisible();
  });

  it("keeps loading, error, retry and empty states explicit", async () => {
    let resolveRequest!: (value: typeof page) => void;
    fetchMovementsMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolveRequest = resolve)),
    );
    renderWithQueryClient(<MovementsClient />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Carregando movimentações",
    );
    resolveRequest(page);
    expect(await screen.findByText("Ana Silva")).toBeVisible();

    fetchMovementsMock.mockRejectedValueOnce(
      new Error("Movimentações indisponíveis."),
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Participante"), "Erro");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Movimentações indisponíveis.",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Ana Silva")).toBeVisible();

    fetchMovementsMock.mockResolvedValueOnce({
      items: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    await user.clear(screen.getByLabelText("Participante"));
    await user.type(screen.getByLabelText("Participante"), "Vazio");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    expect(
      await screen.findByText("Nenhuma movimentação encontrada."),
    ).toBeVisible();
  });

  it("validates the exclusive date range before applying filters", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<MovementsClient />);
    await screen.findByText("Ana Silva");

    fireEvent.change(screen.getByLabelText("Data inicial"), {
      target: { value: "2026-08-24" },
    });
    fireEvent.change(screen.getByLabelText("Data final exclusiva"), {
      target: { value: "2026-08-24" },
    });
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A data inicial deve ser anterior à data final exclusiva.",
    );
    expect(fetchMovementsMock).toHaveBeenCalledTimes(1);
  });

  it("resets pagination when applied filters change and exports without page or limit", async () => {
    fetchMovementsMock.mockImplementation(async (filters) => ({
      items: [movement],
      meta: {
        page: filters.page,
        limit: 20,
        total: 21,
        totalPages: 2,
      },
    }));
    const user = userEvent.setup();
    renderWithQueryClient(<MovementsClient />);
    await screen.findByText("Ana Silva");
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() =>
      expect(fetchMovementsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, limit: 20 }),
      ),
    );

    await user.type(screen.getByLabelText("Participante"), "Ana");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() =>
      expect(fetchMovementsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, limit: 20, search: "Ana" }),
      ),
    );

    await user.click(
      screen.getByRole("button", { name: "Exportar movimentações" }),
    );
    expect(await screen.findByText("1 registro")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() =>
      expect(fetchExportCountMock).toHaveBeenCalledWith({ search: "Ana" }),
    );
    expect(downloadExportMock).toHaveBeenCalledWith({ search: "Ana" });
  });
});
