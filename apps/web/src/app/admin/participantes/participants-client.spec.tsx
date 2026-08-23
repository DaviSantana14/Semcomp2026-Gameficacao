import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAdminParticipants,
  updateParticipantStatus,
} from "@/features/participants/participants.service";
import {
  downloadParticipantsExport,
  fetchParticipantsExportCount,
} from "@/features/exports/exports.service";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { ParticipantsClient } from "./participants-client";

vi.mock("@/features/participants/participants.service", () => ({
  fetchAdminParticipants: vi.fn(),
  updateParticipantStatus: vi.fn(),
}));
vi.mock("@/features/exports/exports.service", () => ({
  downloadParticipantsExport: vi.fn(),
  fetchParticipantsExportCount: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const fetchMock = vi.mocked(fetchAdminParticipants);
const updateMock = vi.mocked(updateParticipantStatus);
const exportCountMock = vi.mocked(fetchParticipantsExportCount);
const exportDownloadMock = vi.mocked(downloadParticipantsExport);
const participant = {
  id: "participant-1",
  name: "Ana Silva",
  cpf: "12345678901",
  email: "ana@example.com",
  points: 100,
  xp: 50,
  level: 1,
  isActive: true,
  lastLoginAt: null,
  actionRedemptionsCount: 2,
  pendingRewardRedemptionsCount: 1,
  createdAt: "2026-07-12T12:00:00.000Z",
  updatedAt: "2026-07-12T12:00:00.000Z",
};

describe("ParticipantsClient audited status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      items: [participant],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    exportCountMock.mockResolvedValue({ count: 1, maxRows: 50_000 });
    exportDownloadMock.mockResolvedValue(undefined);
  });

  it("envia contexto e preserva o motivo para retry da mesma pessoa", async () => {
    updateMock.mockRejectedValueOnce(new ApiError("Falha controlada", 400));
    const user = userEvent.setup();
    renderWithQueryClient(<ParticipantsClient />);

    await user.click(
      await screen.findByRole("button", { name: "Desativar Ana Silva" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Participante Ana Silva")).toBeVisible();
    expect(within(dialog).getByText("Ativo")).toBeVisible();
    expect(within(dialog).getByText("Inativo")).toBeVisible();
    await user.type(within(dialog).getByLabelText("Motivo"), "Acesso suspenso");
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar desativação" }),
    );

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("participant-1", {
        isActive: false,
        reason: "Acesso suspenso",
      }),
    );
    expect(within(dialog).getByLabelText("Motivo")).toHaveValue(
      "Acesso suspenso",
    );
  });

  it("organiza filtros e participantes em regiões operacionais", async () => {
    renderWithQueryClient(<ParticipantsClient />);

    expect(
      screen.getByRole("region", { name: "Filtros de participantes" }),
    ).toBeVisible();
    expect(
      await screen.findByRole("region", { name: "Participantes cadastrados" }),
    ).toBeVisible();
  });

  it("does not export a typed search until the participant filter is applied", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ParticipantsClient />);

    await user.type(screen.getByLabelText("Nome, e-mail ou CPF"), "rascunho");
    await user.click(
      screen.getByRole("button", { name: "Exportar participantes" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Exportar CSV" }),
    );
    expect(exportCountMock).toHaveBeenCalledWith({
      search: undefined,
      status: undefined,
    });
    expect(exportDownloadMock).toHaveBeenCalledWith({
      search: undefined,
      status: undefined,
    });

    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        search: "rascunho",
        status: undefined,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Exportar participantes" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Exportar CSV" }),
    );
    expect(exportCountMock).toHaveBeenLastCalledWith({
      search: "rascunho",
      status: undefined,
    });
    expect(exportDownloadMock).toHaveBeenLastCalledWith({
      search: "rascunho",
      status: undefined,
    });
  });
});
