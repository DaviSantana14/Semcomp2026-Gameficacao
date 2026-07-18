import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import {
  AdjustmentDialog,
  ReversalDialog,
} from "./participant-operation-dialogs";

describe("adjustment dialog", () => {
  it("preserves the form after failure and blocks duplicate submission", async () => {
    let reject!: (error: Error) => void;
    const submit = vi.fn(
      () => new Promise<never>((_, rejectPromise) => (reject = rejectPromise)),
    );
    render(
      <AdjustmentDialog
        balance={{ points: 30, xp: 8 }}
        initialDeltas={{ pointsDelta: 0, xpDelta: 0 }}
        onClose={vi.fn()}
        onSubmit={submit}
        open
      />,
    );
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Delta de pontos"));
    await user.type(screen.getByLabelText("Delta de pontos"), "5");
    await user.type(screen.getByLabelText("Motivo"), "Correcao operacional");
    await user.click(screen.getByLabelText("Revisei os saldos previstos"));
    const button = screen.getByRole("button", { name: "Confirmar ajuste" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    reject(new Error("Falha"));
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(screen.getByLabelText("Motivo")).toHaveValue("Correcao operacional");
  });

  it("keeps domain errors and blocks every close path while pending", async () => {
    let reject!: (error: Error) => void;
    const onClose = vi.fn();
    const submit = vi.fn(
      () => new Promise<never>((_, rejectPromise) => (reject = rejectPromise)),
    );
    render(
      <AdjustmentDialog
        balance={{ points: 30, xp: 8 }}
        initialDeltas={{ pointsDelta: 5, xpDelta: 0 }}
        onClose={onClose}
        onSubmit={submit}
        open
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Motivo"), "Correcao operacional");
    await user.click(screen.getByLabelText("Revisei os saldos previstos"));
    await user.click(screen.getByRole("button", { name: "Confirmar ajuste" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).not.toHaveBeenCalled();
    reject(new ApiError("Saldo alterado por outra operacao", 422));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Saldo alterado por outra operacao",
    );
    expect(screen.getByLabelText("Motivo")).toHaveValue("Correcao operacional");
  });
});

describe("reversal dialog", () => {
  it("shows original/opposite deltas and current/predicted balances", () => {
    render(
      <ReversalDialog
        balance={{ points: 50, xp: 20 }}
        event={{ pointsDelta: 12, xpDelta: 3 }}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText("Evento original")).toBeInTheDocument();
    expect(screen.getByText("Delta do estorno")).toBeInTheDocument();
    expect(screen.getByText("Saldo atual")).toBeInTheDocument();
    expect(screen.getByText("Saldo após estorno")).toBeInTheDocument();
    expect(screen.getAllByText("+12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-12").length).toBeGreaterThan(0);
    expect(screen.getByText("38")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Revisei o evento original e os saldos do estorno"),
    ).toBeInTheDocument();
  });

  it("traps focus and restores it to the trigger on close", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Abrir estorno</button>
          {open ? (
            <ReversalDialog
              balance={{ points: 50, xp: 20 }}
              event={{ pointsDelta: 12, xpDelta: 3 }}
              onClose={() => setOpen(false)}
              onSubmit={vi.fn()}
            />
          ) : null}
        </>
      );
    }
    render(<Harness />);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Abrir estorno" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByLabelText("Motivo")).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("uses the dedicated conflict copy and preserves the reason", async () => {
    const submit = vi.fn().mockRejectedValue(new ApiError("conflict", 409));
    render(
      <ReversalDialog
        balance={{ points: 50, xp: 20 }}
        event={{ pointsDelta: 12, xpDelta: 3 }}
        onClose={vi.fn()}
        onSubmit={submit}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Motivo"), "Estorno solicitado");
    await user.click(
      screen.getByLabelText("Revisei o evento original e os saldos do estorno"),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar estorno" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Conflito");
    expect(screen.getByLabelText("Motivo")).toHaveValue("Estorno solicitado");
  });
});
