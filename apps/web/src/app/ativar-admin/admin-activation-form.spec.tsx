import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activateAdmin } from "@/features/auth/auth.service";
import { AdminActivationForm } from "./admin-activation-form";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));
vi.mock("@/features/auth/auth.service", () => ({
  activateAdmin: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const activateAdminMock = vi.mocked(activateAdmin);

async function fillActivationForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Código de ativação"), "ABCDE-FGHJK-LMNPQ-RSTUV");
  await user.type(screen.getByLabelText("CPF"), "123.456.789-00");
  await user.type(screen.getByLabelText("E-mail"), "Bia@Example.com");
  await user.type(screen.getByLabelText("Senha"), "password-1234");
  await user.type(screen.getByLabelText("Confirmar senha"), "password-1234");
}

describe("AdminActivationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activateAdminMock.mockResolvedValue(undefined);
  });

  it("activates the operator and returns to the admin login", async () => {
    const user = userEvent.setup();
    render(<AdminActivationForm />);
    await fillActivationForm(user);
    await user.click(screen.getByRole("button", { name: "Ativar acesso" }));

    await waitFor(() =>
      expect(activateAdminMock).toHaveBeenCalledWith({
        code: "ABCDE-FGHJK-LMNPQ-RSTUV",
        cpf: "12345678900",
        email: "bia@example.com",
        password: "password-1234",
        passwordConfirmation: "password-1234",
      }),
    );
    expect(replaceMock).toHaveBeenCalledWith("/login/admin");
  });

  it("prevents double submission while activation is pending", async () => {
    let resolve!: () => void;
    activateAdminMock.mockImplementation(
      () => new Promise<void>((done) => (resolve = done)),
    );
    const user = userEvent.setup();
    render(<AdminActivationForm />);
    await fillActivationForm(user);
    const submit = screen.getByRole("button", { name: "Ativar acesso" });
    await user.click(submit);
    await user.click(submit);

    expect(activateAdminMock).toHaveBeenCalledOnce();
    expect(submit).toBeDisabled();
    resolve();
  });

  it("requires all activation credentials before calling the API", async () => {
    const user = userEvent.setup();
    render(<AdminActivationForm />);
    await user.click(screen.getByRole("button", { name: "Ativar acesso" }));

    expect(await screen.findAllByRole("alert")).toHaveLength(5);
    expect(activateAdminMock).not.toHaveBeenCalled();
  });
});
