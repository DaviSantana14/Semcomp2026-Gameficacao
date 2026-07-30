import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Reward } from "@/features/rewards/rewards.types";
import { RewardRedemptionDialog } from "./reward-redemption-dialog";

const reward: Reward = {
  id: "reward-1",
  name: "Camiseta",
  description: "Camiseta oficial",
  costInPoints: 50,
  stock: 2,
  isActive: true,
  imageUrl: null,
  createdAt: "2026-07-12T12:00:00.000Z",
  updatedAt: "2026-07-12T12:00:00.000Z",
};

function Harness({
  error,
  pending = false,
}: {
  error?: string;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setOpen(true)} type="button">
        Abrir resgate
      </button>
      <RewardRedemptionDialog
        error={error}
        onClose={() => setOpen(false)}
        onConfirm={vi.fn()}
        open={open}
        pending={pending}
        points={100}
        reward={reward}
      />
    </div>
  );
}

describe("RewardRedemptionDialog", () => {
  it("prioriza o cancelamento e restaura o foco ao fechar", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Abrir resgate" });
    await user.click(trigger);

    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    expect(screen.getByText("Saldo após o resgate")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("impede fechamento e desabilita ações durante o resgate", async () => {
    const user = userEvent.setup();
    render(<Harness pending />);

    await user.click(screen.getByRole("button", { name: "Abrir resgate" }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Resgatando..." }),
    ).toBeDisabled();
  });

  it("mantém o erro de mutação visível dentro do diálogo", async () => {
    const user = userEvent.setup();
    render(<Harness error="Saldo insuficiente." />);

    await user.click(screen.getByRole("button", { name: "Abrir resgate" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Saldo insuficiente.");
  });
});
