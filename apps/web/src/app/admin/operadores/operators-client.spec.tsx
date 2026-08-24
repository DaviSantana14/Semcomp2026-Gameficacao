import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOperator,
  fetchOperators,
} from "@/features/operators/operators.service";
import { renderWithQueryClient } from "@/test/render";
import { OperatorsClient } from "./operators-client";

vi.mock("@/features/operators/operators.service", () => ({
  createOperator: vi.fn(),
  fetchOperators: vi.fn(),
  resetOperatorActivation: vi.fn(),
  updateOperator: vi.fn(),
  updateOperatorStatus: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const fetchOperatorsMock = vi.mocked(fetchOperators);
const createOperatorMock = vi.mocked(createOperator);

const operator = {
  id: "operator-1",
  name: "Bia",
  cpf: "12345678900",
  email: "bia@example.com",
  adminProfile: "SHOP" as const,
  state: "PENDING_ACTIVATION" as const,
  isActive: true,
  activationExpiresAt: "2026-08-23T13:00:00.000Z",
  lastLoginAt: null,
  passwordChangedAt: null,
  createdAt: "2026-08-23T12:00:00.000Z",
  updatedAt: "2026-08-23T12:00:00.000Z",
};

describe("OperatorsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchOperatorsMock.mockResolvedValue({
      items: [operator],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    createOperatorMock.mockResolvedValue({
      operator,
      activationCode: "ABCDE-FGHJK-LMNPQ-RSTUV",
      expiresAt: "2026-08-23T13:00:00.000Z",
    });
  });

  it("creates an operator and keeps the activation code only in the result dialog", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<OperatorsClient />);

    await waitFor(() => expect(screen.getByText("Bia")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Novo operador" }));
    await user.type(screen.getByLabelText("Nome"), "Nova Operadora");
    await user.type(screen.getByLabelText("CPF"), "987.654.321-00");
    await user.type(screen.getByLabelText("E-mail"), "nova@example.com");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Perfil" }),
      "ACTIVITIES",
    );
    await user.type(
      screen.getByLabelText("Motivo"),
      "Necessidade de cobertura operacional",
    );
    await user.click(screen.getByRole("button", { name: "Criar operador" }));

    await waitFor(() =>
      expect(createOperatorMock).toHaveBeenCalledWith({
        name: "Nova Operadora",
        cpf: "98765432100",
        email: "nova@example.com",
        adminProfile: "ACTIVITIES",
        reason: "Necessidade de cobertura operacional",
      }),
    );
    expect(screen.getByTestId("operator-activation-code")).toHaveTextContent(
      "ABCDE-FGHJK-LMNPQ-RSTUV",
    );

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByTestId("operator-activation-code")).not.toBeInTheDocument();
  });
});
