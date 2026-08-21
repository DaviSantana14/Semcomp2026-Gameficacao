import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "@/features/auth/auth.service";
import type { User, UserRole } from "@/features/users/users.types";
import { LoginForm } from "./login-form";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/features/auth/auth.service", () => ({
  login: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const loginMock = vi.mocked(login);

function createUser(role: UserRole): User {
  return {
    id: `${role.toLowerCase()}-1`,
    name: role === "ADMIN" ? "Admin SEMCOMP" : "Davi Santos",
    cpf: "12345678900",
    email: "davi@example.com",
    role,
    points: 620,
    xp: 1840,
    level: 7,
    isActive: true,
    lastLoginAt: null,
    createdAt: "2026-07-18T12:00:00.000Z",
  };
}

async function submitValidLogin() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("CPF"), "123.456.789-00");
  await user.type(screen.getByLabelText("E-mail"), "Davi@Example.com");
  await user.click(screen.getByRole("button", { name: "Entrar na jornada" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normaliza as credenciais e direciona o participante para a jornada", async () => {
    loginMock.mockResolvedValue({
      csrfToken: "csrf-token",
      user: createUser("PARTICIPANT"),
    });
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        cpf: "12345678900",
        email: "davi@example.com",
      }),
    );
    expect(replaceMock).toHaveBeenCalledWith("/home");
  });

  it("expõe erros de validação sem chamar o serviço", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Entrar na jornada" }));

    expect(await screen.findAllByRole("alert")).toHaveLength(2);
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("mantém o formulário de participante sem campo de senha", () => {
    render(<LoginForm />);

    expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
  });

  it("mantém o redirecionamento administrativo", async () => {
    loginMock.mockResolvedValue({
      csrfToken: "csrf-token",
      user: createUser("ADMIN"),
    });
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/admin"));
  });
});
