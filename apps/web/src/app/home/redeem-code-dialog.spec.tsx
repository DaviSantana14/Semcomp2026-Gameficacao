import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redeemActionCode } from "@/features/actions/actions.service";
import { startQrScanner } from "@/features/actions/qr-scanner";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { RedeemCodeDialog } from "./redeem-code-dialog";

vi.mock("@/features/actions/actions.service", () => ({
  redeemActionCode: vi.fn(),
}));
vi.mock("@/features/actions/qr-scanner", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/actions/qr-scanner")>();
  return { ...actual, startQrScanner: vi.fn() };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const toast = await import("sonner").then((module) => module.toast);
const redeemActionCodeMock = vi.mocked(redeemActionCode);
const startQrScannerMock = vi.mocked(startQrScanner);
const scannerStopMock = vi.fn();
let scannerEmit!: (code: string) => void;

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
  awardedXp: 7,
  currentPoints: 20,
  currentXp: 20,
  currentLevel: 1,
  message: "Atividade resgatada.",
  redeemedAt: "2026-07-12T12:00:00.000Z",
};

function CloseableDialog({ onClose }: { onClose: () => void }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <RedeemCodeDialog
      isOpen={isOpen}
      onClose={() => {
        onClose();
        setIsOpen(false);
      }}
    />
  );
}

describe("RedeemCodeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startQrScannerMock.mockImplementation(async (_video, onDetected) => {
      scannerEmit = onDetected;
      return { stop: scannerStopMock };
    });
  });

  it("normaliza o código, invalida o perfil e fecha após um resgate", async () => {
    redeemActionCodeMock.mockResolvedValue(redeemedAction);
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(
      <RedeemCodeDialog isOpen onClose={onClose} />,
    );
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    await user.type(screen.getByLabelText("Código"), " dia-1 ");
    await user.click(screen.getByRole("button", { name: "Resgatar código" }));

    await waitFor(() => {
      expect(redeemActionCodeMock).toHaveBeenCalledWith("DIA-1");
      expect(onClose).toHaveBeenCalledOnce();
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["me"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["ranking"] });
    expect(toast.success).toHaveBeenCalledWith("Check-in: +7 XP");
  });

  it("mostra a mensagem da API para um código inválido", async () => {
    redeemActionCodeMock.mockRejectedValue(
      new ApiError("Este código já foi utilizado.", 409),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<RedeemCodeDialog isOpen onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Código"), "DIA-1");
    await user.click(screen.getByRole("button", { name: "Resgatar código" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Este código já foi utilizado.");
    });
  });

  it("mostra a mensagem padrão quando a falha não é um erro conhecido da API", async () => {
    redeemActionCodeMock.mockRejectedValue(new Error("Falha de rede"));
    const user = userEvent.setup();
    renderWithQueryClient(<RedeemCodeDialog isOpen onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Código"), "DIA-1");
    await user.click(screen.getByRole("button", { name: "Resgatar código" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível resgatar este código.",
      );
    });
  });

  it("inicia a câmera por gesto e exige confirmação antes do resgate", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<RedeemCodeDialog isOpen onClose={vi.fn()} />);

    expect(startQrScannerMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Usar câmera" }));
    await waitFor(() => expect(startQrScannerMock).toHaveBeenCalledOnce());

    scannerEmit("ABCD-EFGH");

    expect(redeemActionCodeMock).not.toHaveBeenCalled();
    expect(await screen.findByText("ABCD-EFGH")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar resgate" }));

    await waitFor(() => {
      expect(redeemActionCodeMock).toHaveBeenCalledWith("ABCD-EFGH");
    });
  });

  it("volta ao modo manual quando o código detectado é editado", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<RedeemCodeDialog isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Usar câmera" }));
    await waitFor(() => expect(startQrScannerMock).toHaveBeenCalledOnce());
    scannerEmit("ABCD-EFGH");
    await screen.findByText("ABCD-EFGH");

    const input = screen.getByLabelText("Código");
    await user.clear(input);
    await user.type(input, "IJKL-MNOP");

    expect(screen.queryByText("ABCD-EFGH")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resgatar código" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirmar resgate" }),
    ).not.toBeInTheDocument();
  });

  it("encerra a sessão da câmera ao fechar o diálogo", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithQueryClient(<CloseableDialog onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Usar câmera" }));
    await waitFor(() => expect(startQrScannerMock).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(scannerStopMock).toHaveBeenCalledOnce();
  });

  it("mostra uma orientação acionável quando o dispositivo nega a câmera", async () => {
    const error = new DOMException("Permission denied", "NotAllowedError");
    startQrScannerMock.mockRejectedValueOnce(error);
    const user = userEvent.setup();
    renderWithQueryClient(<RedeemCodeDialog isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Usar câmera" }));

    expect(
      await screen.findByText(
        "Permita o acesso à câmera para escanear o código.",
      ),
    ).toBeInTheDocument();
  });
});
