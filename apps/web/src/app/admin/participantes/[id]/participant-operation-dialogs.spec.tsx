import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdjustmentDialog } from "./participant-operation-dialogs";

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
});
