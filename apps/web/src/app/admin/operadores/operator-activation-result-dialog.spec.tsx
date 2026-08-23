import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OperatorActivationResultDialog } from "./operator-activation-result-dialog";

describe("OperatorActivationResultDialog", () => {
  it("removes the one-time activation code when it is closed", async () => {
    const onClose = vi.fn();
    render(
      <OperatorActivationResultDialog
        onClose={onClose}
        result={{
          operator: {
            id: "operator-1",
            name: "Bia",
            cpf: "12345678900",
            email: "bia@example.com",
            adminProfile: "SHOP",
            state: "PENDING_ACTIVATION",
            isActive: true,
            activationExpiresAt: "2026-08-23T13:00:00.000Z",
            lastLoginAt: null,
            passwordChangedAt: null,
            createdAt: "2026-08-23T12:00:00.000Z",
            updatedAt: "2026-08-23T12:00:00.000Z",
          },
          activationCode: "ABCDE-FGHJK-LMNPQ-RSTUV",
          expiresAt: "2026-08-23T13:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByText("ABCDE-FGHJK-LMNPQ-RSTUV")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Fechar" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
