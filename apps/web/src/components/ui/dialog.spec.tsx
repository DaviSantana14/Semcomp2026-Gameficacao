import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { Dialog } from "./dialog";

function DialogHarness({ preventClose = false }: { preventClose?: boolean }) {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <div>
      <button onClick={() => setOpen(true)} type="button">
        Abrir
      </button>
      <Dialog
        initialFocusRef={cancelRef}
        onClose={() => setOpen(false)}
        open={open}
        preventClose={preventClose}
        titleId="dialog-title"
      >
        <h2 id="dialog-title">Confirmar resgate</h2>
        <button ref={cancelRef} type="button">
          Cancelar
        </button>
        <button type="button">Confirmar</button>
      </Dialog>
    </div>
  );
}

describe("Dialog", () => {
  it("move o foco para o conteúdo e o devolve ao gatilho ao fechar", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));

    expect(
      screen.getByRole("dialog", { name: "Confirmar resgate" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir" })).toHaveFocus();
  });

  it("mantém o foco em ciclo dentro do diálogo", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Confirmar" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });

  it("bloqueia Escape e clique no fundo quando o fechamento está impedido", async () => {
    const user = userEvent.setup();
    render(<DialogHarness preventClose />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("dialog-backdrop"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
