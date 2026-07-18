import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminReasonDialog } from "./admin-reason-dialog";

describe("AdminReasonDialog", () => {
  it("trims the reason, blocks double submit and preserves it for retry", async () => {
    let reject!: (error: Error) => void;
    const submit = vi.fn(
      () => new Promise<never>((_, rejectPromise) => (reject = rejectPromise)),
    );
    render(
      <AdminReasonDialog
        confirmLabel="Confirmar alteração"
        currentState="Ativo"
        description="Participante Ana"
        intendedState="Inativo"
        onClose={vi.fn()}
        onSubmit={submit}
        operationKey="participant-1:inactive"
        title="Alterar status"
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Motivo"), "  Ajuste solicitado  ");
    const confirm = screen.getByRole("button", {
      name: "Confirmar alteração",
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("Ajuste solicitado");
    expect(confirm).toBeDisabled();
    reject(new Error("Falha temporária"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha temporária",
    );
    expect(screen.getByLabelText("Motivo")).toHaveValue(
      "  Ajuste solicitado  ",
    );
    await user.click(confirm);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("validates trimmed length and starts clean for a new operation", async () => {
    const submit = vi.fn();
    const { rerender } = render(
      <AdminReasonDialog
        confirmLabel="Confirmar"
        currentState="Disponível"
        description="Código ABCD-****"
        intendedState="Desativado"
        onClose={vi.fn()}
        onSubmit={submit}
        operationKey="code-1:disabled"
        title="Alterar código"
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Motivo"), "   curto   ");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    expect(screen.getByText(/de 10 a 500 caracteres/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Motivo"));
    await user.type(screen.getByLabelText("Motivo"), "Motivo suficiente");
    rerender(
      <AdminReasonDialog
        confirmLabel="Confirmar"
        currentState="Ativo"
        description="Código WXYZ-****"
        intendedState="Desativado"
        onClose={vi.fn()}
        onSubmit={submit}
        operationKey="code-2:disabled"
        title="Alterar código"
      />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Motivo")).toHaveValue(""),
    );
    expect(screen.getByText("Código WXYZ-****")).toBeInTheDocument();
    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(screen.getByText("Desativado")).toBeInTheDocument();
  });
});
