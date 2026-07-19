import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAdminActions,
  generateClaimCodes,
} from "@/features/actions/actions.service";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { ClaimCodeGenerator } from "./claim-code-generator";

vi.mock("@/features/actions/actions.service", () => ({
  fetchAdminActions: vi.fn(),
  generateClaimCodes: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const fetchActionsMock = vi.mocked(fetchAdminActions);
const generateMock = vi.mocked(generateClaimCodes);
const actions = [
  {
    id: "action-1",
    name: "Check-in",
    description: null,
    type: "CHECKIN" as const,
    code: null,
    points: 10,
    isActive: true,
    isCodeActive: true,
    createdAt: "2026-07-12T12:00:00.000Z",
    claimCodes: { total: 0, used: 0, available: 0 },
    redemptionsCount: 0,
  },
  {
    id: "action-2",
    name: "Palestra",
    description: null,
    type: "ATTENDANCE" as const,
    code: null,
    points: 20,
    isActive: true,
    isCodeActive: true,
    createdAt: "2026-07-12T12:00:00.000Z",
    claimCodes: { total: 0, used: 0, available: 0 },
    redemptionsCount: 0,
  },
];

describe("ClaimCodeGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchActionsMock.mockResolvedValue({
      items: actions,
      meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
    });
  });

  it("expõe a geração como região principal da central", () => {
    renderWithQueryClient(<ClaimCodeGenerator />);

    expect(
      screen.getByRole("region", { name: "Gerar lote de códigos" }),
    ).toBeVisible();
  });

  it("limpa o motivo ao mudar de atividade", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ClaimCodeGenerator />);

    const activity = await screen.findByLabelText("Atividade");
    await user.selectOptions(activity, "action-1");
    await user.type(screen.getByLabelText("Motivo"), "Lote para check-in");
    await user.selectOptions(activity, "action-2");

    expect(screen.getByLabelText("Motivo")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Gerar lote" })).toBeDisabled();
  });

  it("preserva motivo no erro e bloqueia troca de entidade durante pending", async () => {
    let rejectGenerate!: (error: Error) => void;
    generateMock.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectGenerate = reject;
        }),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<ClaimCodeGenerator />);

    const activity = await screen.findByLabelText("Atividade");
    await user.selectOptions(activity, "action-1");
    await user.type(screen.getByLabelText("Motivo"), "Lote para check-in");
    await user.click(screen.getByRole("button", { name: "Gerar lote" }));

    expect(generateMock).toHaveBeenCalledWith("action-1", {
      quantity: 50,
      reason: "Lote para check-in",
    });
    expect(activity).toBeDisabled();
    expect(screen.getByLabelText("Quantidade")).toBeDisabled();
    expect(screen.getByLabelText("Motivo")).toBeDisabled();

    rejectGenerate(new ApiError("Falha ao gerar.", 400));
    await waitFor(() => expect(activity).not.toBeDisabled());
    expect(screen.getByLabelText("Motivo")).toHaveValue("Lote para check-in");
    expect(screen.getByLabelText("Motivo")).toHaveAccessibleDescription(
      "Informe de 10 a 500 caracteres.",
    );
  });
});
