import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redeemActionCode } from "@/features/actions/actions.service";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { RedeemCodeDialog } from "./redeem-code-dialog";

vi.mock("@/features/actions/actions.service", () => ({
  redeemActionCode: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const toast = await import("sonner").then((module) => module.toast);
const redeemActionCodeMock = vi.mocked(redeemActionCode);

const redeemedAction = {
  action: {
    id: "action-1",
    name: "Check-in",
    description: null,
    type: "CHECKIN" as const,
    code: "DIA-1",
    points: 20,
    isActive: true,
    isCodeActive: true,
    createdAt: "2026-07-12T12:00:00.000Z",
  },
  awardedPoints: 20,
  currentPoints: 20,
  currentXp: 20,
  currentLevel: 1,
  message: "Atividade resgatada.",
  redeemedAt: "2026-07-12T12:00:00.000Z",
};

describe("RedeemCodeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normaliza o código, invalida o perfil e fecha após um resgate", async () => {
    redeemActionCodeMock.mockResolvedValue(redeemedAction);
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(
      <RedeemCodeDialog isOpen onClose={onClose} />,
    );
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    await user.type(screen.getByLabelText("Codigo"), " dia-1 ");
    await user.click(screen.getByRole("button", { name: "Resgatar codigo" }));

    await waitFor(() => {
      expect(redeemActionCodeMock).toHaveBeenCalledWith("DIA-1");
      expect(onClose).toHaveBeenCalledOnce();
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["me"] });
    expect(toast.success).toHaveBeenCalledWith("Check-in: +20 XP");
  });

  it("mostra a mensagem da API para um código inválido", async () => {
    redeemActionCodeMock.mockRejectedValue(
      new ApiError("Este código já foi utilizado.", 409),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<RedeemCodeDialog isOpen onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Codigo"), "DIA-1");
    await user.click(screen.getByRole("button", { name: "Resgatar codigo" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Este código já foi utilizado.");
    });
  });

  it("mostra a mensagem padrão quando a falha não é um erro conhecido da API", async () => {
    redeemActionCodeMock.mockRejectedValue(new Error("Falha de rede"));
    const user = userEvent.setup();
    renderWithQueryClient(<RedeemCodeDialog isOpen onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Codigo"), "DIA-1");
    await user.click(screen.getByRole("button", { name: "Resgatar codigo" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Nao foi possivel resgatar este codigo.",
      );
    });
  });
});
