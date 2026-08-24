import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchClaimCodeBatches } from "@/features/actions/actions.service";
import { downloadFile } from "@/lib/http/download";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { ClaimCodeBatchHistory } from "./claim-code-batch-history";

vi.mock("@/features/actions/actions.service", () => ({
  fetchClaimCodeBatches: vi.fn(),
}));
vi.mock("@/lib/http/download", () => ({ downloadFile: vi.fn() }));

const fetchBatchesMock = vi.mocked(fetchClaimCodeBatches);
const downloadMock = vi.mocked(downloadFile);

const batch = {
  id: "batch-1",
  action: { id: "action-1", name: "Check-in" },
  createdBy: {
    id: "admin-1",
    name: "Admin Semcomp",
    email: "admin@example.com",
  },
  requestedQuantity: 4,
  createdQuantity: 4,
  reason: "Geracao administrativa do lote",
  requestId: "request-1",
  createdAt: "2026-08-22T12:00:00.000Z",
  counts: { available: 2, disabled: 1, used: 1, blocked: 0 },
};

const page = {
  items: [batch],
  meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

describe("ClaimCodeBatchHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBatchesMock.mockResolvedValue(page);
    downloadMock.mockResolvedValue(undefined);
  });

  it("mostra os metadados e baixa TXT, PDF e PNGs do lote", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ClaimCodeBatchHistory />);

    expect(await screen.findByText("Lote batch-1")).toBeVisible();
    expect(screen.getByText(/Geracao administrativa do lote/)).toBeVisible();
    expect(screen.getByText(/Admin Semcomp/)).toBeVisible();
    expect(screen.getByText("Disponíveis: 2")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Baixar TXT" }));
    await user.click(screen.getByRole("button", { name: "Baixar PDF" }));
    await user.click(screen.getByRole("button", { name: "Baixar PNGs" }));

    expect(downloadMock).toHaveBeenNthCalledWith(
      1,
      "/admin/claim-code-batches/batch-1/download.txt",
    );
    expect(downloadMock).toHaveBeenNthCalledWith(
      2,
      "/admin/claim-code-batches/batch-1/qr.pdf",
    );
    expect(downloadMock).toHaveBeenNthCalledWith(
      3,
      "/admin/claim-code-batches/batch-1/qr-images.zip",
    );
  });

  it("mostra a mensagem da API e permite tentar novamente", async () => {
    fetchBatchesMock
      .mockReset()
      .mockRejectedValueOnce(new ApiError("Histórico indisponível.", 503))
      .mockResolvedValueOnce(page);
    const user = userEvent.setup();
    renderWithQueryClient(<ClaimCodeBatchHistory />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Histórico indisponível.",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Lote batch-1")).toBeVisible();
  });

  it("mostra estado vazio sem inventar códigos históricos", async () => {
    fetchBatchesMock.mockResolvedValueOnce({
      items: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
    renderWithQueryClient(<ClaimCodeBatchHistory />);

    expect(
      await screen.findByText("Nenhum lote de códigos encontrado."),
    ).toBeVisible();
    expect(screen.queryByText(/ABCD|EFGH/)).not.toBeInTheDocument();
  });

  it("mantém pending independente e expõe erro de download", async () => {
    let resolveDownload!: () => void;
    downloadMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolveDownload = resolve)),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<ClaimCodeBatchHistory />);
    await screen.findByText("Lote batch-1");

    const pdfButton = screen.getByRole("button", { name: "Baixar PDF" });
    const txtButton = screen.getByRole("button", { name: "Baixar TXT" });
    await user.click(pdfButton);
    expect(pdfButton).toBeDisabled();
    expect(txtButton).toBeEnabled();

    resolveDownload();
    await waitFor(() => expect(pdfButton).toBeEnabled());

    downloadMock.mockRejectedValueOnce(new ApiError("PDF indisponível.", 429));
    await user.click(pdfButton);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "PDF indisponível.",
    );
  });
});
