import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/http/client";
import { activateAdmin } from "@/features/auth/auth.service";
import {
  createOperator,
  fetchOperators,
  resetOperatorActivation,
  updateOperator,
  updateOperatorStatus,
} from "./operators.service";

vi.mock("@/lib/http/client", () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);

describe("operators service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({} as never);
  });

  it("lists operators with the supported filters", async () => {
    await fetchOperators({
      page: 2,
      limit: 20,
      search: "Bia",
      adminProfile: "SHOP",
      state: "ACTIVE",
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/admin/operators?page=2&limit=20&search=Bia&adminProfile=SHOP&state=ACTIVE",
      undefined,
    );
  });

  it("sends normalized operator mutations with their reason", async () => {
    await createOperator({
      name: "Bia",
      cpf: "12345678900",
      email: "bia@example.com",
      adminProfile: "SHOP",
      reason: "Necessidade operacional confirmada",
    });
    await updateOperator("operator-1", {
      adminProfile: "ACTIVITIES",
      reason: "Mudança de frente operacional",
    });
    await updateOperatorStatus("operator-1", {
      isActive: false,
      reason: "Pausa operacional registrada",
    });
    await resetOperatorActivation("operator-1", {
      reason: "Novo código solicitado pelo operador",
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/admin/operators", {
      method: "POST",
      body: JSON.stringify({
        name: "Bia",
        cpf: "12345678900",
        email: "bia@example.com",
        adminProfile: "SHOP",
        reason: "Necessidade operacional confirmada",
      }),
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/admin/operators/operator-1", {
      method: "PATCH",
      body: JSON.stringify({
        adminProfile: "ACTIVITIES",
        reason: "Mudança de frente operacional",
      }),
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, "/admin/operators/operator-1/status", {
      method: "PATCH",
      body: JSON.stringify({
        isActive: false,
        reason: "Pausa operacional registrada",
      }),
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(4, "/admin/operators/operator-1/activation-reset", {
      method: "POST",
      body: JSON.stringify({ reason: "Novo código solicitado pelo operador" }),
    });
  });

  it("activates an administrator without CSRF or a session token", async () => {
    await activateAdmin({
      code: "ABCDE-FGHJK-LMNPQ-RSTUV",
      cpf: "12345678900",
      email: "bia@example.com",
      password: "password-1234",
      passwordConfirmation: "password-1234",
    });

    expect(apiFetchMock).toHaveBeenCalledWith("/auth/admin/activate", {
      method: "POST",
      body: JSON.stringify({
        code: "ABCDE-FGHJK-LMNPQ-RSTUV",
        cpf: "12345678900",
        email: "bia@example.com",
        password: "password-1234",
        passwordConfirmation: "password-1234",
      }),
      skipCsrf: true,
    });
  });
});
