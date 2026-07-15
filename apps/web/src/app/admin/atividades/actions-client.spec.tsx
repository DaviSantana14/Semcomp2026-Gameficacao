import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAction,
  fetchAdminActions,
  updateAction,
} from "@/features/actions/actions.service";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { ActionsClient } from "./actions-client";

vi.mock("@/features/actions/actions.service", () => ({
  createAction: vi.fn(),
  fetchAdminActions: vi.fn(),
  updateAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const toast = await import("sonner").then((module) => module.toast);
const createActionMock = vi.mocked(createAction);
const fetchAdminActionsMock = vi.mocked(fetchAdminActions);
const updateActionMock = vi.mocked(updateAction);

const action = {
  id: "action-1",
  name: "Check-in",
  description: "Descrição original",
  type: "CHECKIN" as const,
  code: "DIA1",
  points: 10,
  isActive: true,
  isCodeActive: true,
  createdAt: "2026-07-12T12:00:00.000Z",
  claimCodes: { total: 0, used: 0, available: 0 },
  redemptionsCount: 0,
};

function setupActionsQuery() {
  fetchAdminActionsMock.mockResolvedValue({
    items: [action],
    meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
  });
}

describe("ActionsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupActionsQuery();
  });

  it("cria uma atividade com nome normalizado e código em maiúsculas", async () => {
    createActionMock.mockResolvedValue(action);
    const user = userEvent.setup();
    renderWithQueryClient(<ActionsClient />);

    await user.type(screen.getByLabelText("Nome"), "  Palestra  ");
    await user.type(screen.getByLabelText("Código reutilizável"), " dia2 ");
    await user.type(screen.getByLabelText("Motivo"), "Criação planejada");
    await user.click(screen.getByRole("button", { name: "Criar atividade" }));

    await waitFor(() => {
      expect(createActionMock).toHaveBeenCalledWith({
        name: "Palestra",
        description: undefined,
        type: "CHECKIN",
        points: 10,
        code: "DIA2",
        isActive: true,
        reason: "Criação planejada",
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Atividade criada.");
  });

  it("rejeita localmente o formato reservado para código único", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ActionsClient />);

    await user.type(screen.getByLabelText("Nome"), "Dinâmica");
    await user.type(screen.getByLabelText("Código reutilizável"), "K7XM-9N2P");
    await user.type(screen.getByLabelText("Motivo"), "Criação planejada");
    await user.click(screen.getByRole("button", { name: "Criar atividade" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "O formato XXXX-XXXX é reservado para códigos de uso único.",
      );
    });
    expect(createActionMock).not.toHaveBeenCalled();
  });

  it("envia descrição nula ao editar", async () => {
    updateActionMock.mockResolvedValueOnce(action);
    const user = userEvent.setup();
    renderWithQueryClient(<ActionsClient />);

    await user.click(await screen.findByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Descrição"));
    await user.type(screen.getByLabelText("Motivo"), "Correção solicitada");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(updateActionMock).toHaveBeenCalledWith(action.id, {
        name: action.name,
        description: null,
        type: action.type,
        points: action.points,
        code: action.code,
        reason: "Correção solicitada",
      });
    });
  });

  it("desabilita o toggle pendente e informa falha ao atualizar status", async () => {
    let rejectUpdate!: (error: Error) => void;
    updateActionMock.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectUpdate = reject;
        }),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<ActionsClient />);

    await user.click(
      await screen.findByRole("button", { name: "Desativar atividade" }),
    );
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Motivo"),
      "Pausa operacional",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar alteração" }),
    );

    expect(updateActionMock).toHaveBeenCalledWith(action.id, {
      isActive: false,
      reason: "Pausa operacional",
    });
    expect(
      screen.getByRole("button", { name: "Registrando..." }),
    ).toBeDisabled();

    rejectUpdate(new ApiError("Não foi possível alterar.", 400));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Não foi possível alterar.");
    });
    expect(within(dialog).getByLabelText("Motivo")).toHaveValue(
      "Pausa operacional",
    );
  });

  it("impede trocar ou cancelar a edição enquanto o salvamento está pendente", async () => {
    let resolveUpdate!: (value: typeof action) => void;
    updateActionMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<ActionsClient />);

    await user.click(await screen.findByRole("button", { name: "Editar" }));
    await user.type(screen.getByLabelText("Motivo"), "Correção planejada");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Editar" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Desativar atividade" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Motivo")).toHaveAccessibleDescription(
      "Informe de 10 a 500 caracteres.",
    );
    expect(screen.getByLabelText("Nome")).toBeDisabled();
    expect(screen.getByLabelText("Tipo")).toBeDisabled();
    expect(screen.getByLabelText("Pontos")).toBeDisabled();
    expect(screen.getByLabelText("Código reutilizável")).toBeDisabled();
    expect(screen.getByLabelText("Descrição")).toBeDisabled();
    expect(screen.getByLabelText("Motivo")).toBeDisabled();

    await user.type(screen.getByLabelText("Nome"), " alterado");
    await user.selectOptions(screen.getByLabelText("Tipo"), "BONUS");
    await user.type(screen.getByLabelText("Motivo"), " alterado");

    expect(screen.getByLabelText("Nome")).toHaveValue(action.name);
    expect(screen.getByLabelText("Tipo")).toHaveValue(action.type);
    expect(screen.getByLabelText("Motivo")).toHaveValue("Correção planejada");

    resolveUpdate(action);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Criar atividade" }),
      ).toBeInTheDocument(),
    );
  });
});
