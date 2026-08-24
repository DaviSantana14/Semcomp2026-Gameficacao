import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAdminReusableCodes,
  fetchReusableCodeRedemptions,
  updateAction,
} from "@/features/actions/actions.service";
import { ApiError } from "@/lib/http/api-error";
import { downloadFile } from "@/lib/http/download";
import { renderWithQueryClient } from "@/test/render";
import { ReusableCodeHistory } from "./reusable-code-history";

vi.mock("@/features/actions/actions.service", () => ({
  fetchAdminReusableCodes: vi.fn(),
  fetchReusableCodeRedemptions: vi.fn(),
  updateAction: vi.fn(),
}));
vi.mock("@/lib/http/download", () => ({ downloadFile: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const reusableCodesMock = vi.mocked(fetchAdminReusableCodes);
const redemptionsMock = vi.mocked(fetchReusableCodeRedemptions);
const updateMock = vi.mocked(updateAction);
const downloadMock = vi.mocked(downloadFile);

const reusableCode = {
  id: "action-1",
  name: "Check-in",
  type: "CHECKIN" as const,
  code: "ABCD-EFGH",
  points: 10,
  status: "ACTIVE" as const,
  isCodeActive: true,
  totalUses: 2,
  lastUsedAt: null,
};

describe("ReusableCodeHistory downloads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reusableCodesMock.mockResolvedValue({
      items: [reusableCode],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    redemptionsMock.mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
    updateMock.mockResolvedValue({} as never);
    downloadMock.mockResolvedValue(undefined);
  });

  it("oferece PNG e PDF usando o id da atividade", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ReusableCodeHistory />);

    expect(await screen.findByText("ABCD-EFGH")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Baixar PNG" }));
    await user.click(screen.getByRole("button", { name: "Baixar PDF" }));

    expect(downloadMock).toHaveBeenNthCalledWith(
      1,
      "/admin/reusable-codes/action-1/qr.png",
    );
    expect(downloadMock).toHaveBeenNthCalledWith(
      2,
      "/admin/reusable-codes/action-1/qr.pdf",
    );
  });

  it("não bloqueia o outro formato enquanto um download está pending", async () => {
    let resolveDownload!: () => void;
    downloadMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolveDownload = resolve)),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<ReusableCodeHistory />);
    await screen.findByText("ABCD-EFGH");

    const pngButton = screen.getByRole("button", { name: "Baixar PNG" });
    const pdfButton = screen.getByRole("button", { name: "Baixar PDF" });
    await user.click(pngButton);
    expect(pngButton).toBeDisabled();
    expect(pdfButton).toBeEnabled();

    resolveDownload();
    await waitFor(() => expect(pngButton).toBeEnabled());
  });

  it("mostra a mensagem retornada quando o QR não pode ser baixado", async () => {
    downloadMock.mockRejectedValueOnce(new ApiError("QR indisponível.", 404));
    const user = userEvent.setup();
    renderWithQueryClient(<ReusableCodeHistory />);
    await screen.findByText("ABCD-EFGH");

    await user.click(screen.getByRole("button", { name: "Baixar PNG" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "QR indisponível.",
    );
  });
});
