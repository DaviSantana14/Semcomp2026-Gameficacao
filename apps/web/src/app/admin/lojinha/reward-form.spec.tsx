import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminReward } from "@/features/rewards/rewards.types";
import { RewardForm } from "./reward-form";

const reward: AdminReward = {
  id: "reward-1",
  name: "Camiseta",
  description: "Preta",
  costInPoints: 100,
  stock: 3,
  isActive: true,
  imageUrl: null,
  createdAt: "2026-07-12T12:00:00.000Z",
  updatedAt: "2026-07-12T12:00:00.000Z",
  redemptionCounts: { PENDING: 0, DELIVERED: 0, CANCELLED: 0 },
};

describe("RewardForm audited mutations", () => {
  it("normaliza reason na criação e expõe a regra acessivelmente", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <RewardForm
        reward={null}
        pending={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Nome"), "Brinde");
    await user.type(screen.getByLabelText("Motivo"), "  Novo catálogo  ");
    expect(screen.getByLabelText("Motivo")).toHaveAccessibleDescription(
      "Informe de 10 a 500 caracteres.",
    );
    await user.click(screen.getByRole("button", { name: "Criar recompensa" }));

    expect(onSubmit).toHaveBeenCalledWith({
      mode: "create",
      payload: expect.objectContaining({
        name: "Brinde",
        reason: "Novo catálogo",
      }),
    });
  });

  it("começa sem reason em outra recompensa e bloqueia cancelar no pending", async () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <RewardForm
        key="new"
        reward={null}
        pending={false}
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Motivo"), "Motivo anterior");

    rerender(
      <RewardForm
        key={reward.id}
        reward={reward}
        pending={true}
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Motivo")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Salvando..." })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Cancelar edição" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Nome")).toBeDisabled();
    expect(screen.getByLabelText("URL da imagem")).toBeDisabled();
    expect(screen.getByLabelText("Custo em pontos")).toBeDisabled();
    expect(screen.getByLabelText("Estoque")).toBeDisabled();
    expect(screen.getByLabelText("Descrição")).toBeDisabled();
    expect(screen.getByLabelText("Motivo")).toBeDisabled();

    await user.type(screen.getByLabelText("Nome"), " alterado");
    await user.type(screen.getByLabelText("Motivo"), "Novo motivo");

    expect(screen.getByLabelText("Nome")).toHaveValue(reward.name);
    expect(screen.getByLabelText("Motivo")).toHaveValue("");
  });

  it("congela inclusive o checkbox de criação enquanto salva", async () => {
    const user = userEvent.setup();
    render(
      <RewardForm
        reward={null}
        pending
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const availability = screen.getByRole("checkbox", {
      name: "Disponível imediatamente",
    });
    expect(availability).toBeDisabled();
    expect(availability).toBeChecked();

    await user.click(availability);

    expect(availability).toBeChecked();
  });

  it("envia edição sem isActive e com reason obrigatório", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <RewardForm
        reward={reward}
        pending={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText("Motivo"), "Ajuste de estoque");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(onSubmit).toHaveBeenCalledWith({
      mode: "edit",
      rewardId: "reward-1",
      payload: expect.objectContaining({ reason: "Ajuste de estoque" }),
    });
    expect(onSubmit.mock.calls[0][0].payload).not.toHaveProperty("isActive");
  });
});
