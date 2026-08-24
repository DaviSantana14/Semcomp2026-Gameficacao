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
    adminProfile: role === "ADMIN" ? "GENERAL" : null,
    passwordChangeRequired: false,
    points: 620,
    xp: 1840,
    level: 7,
    isActive: true,
    lastLoginAt: null,
    createdAt: "2026-07-18T12:00:00.000Z",
  };
}

function createParticipantWithRequiredPassword(): User {
  return {
    ...createUser("PARTICIPANT"),
    passwordChangeRequired: true,
  };
}

async function submitValidLogin() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^e-?mail$/i), "Davi@Example.com");
  await user.type(screen.getByLabelText(/^senha$/i), "        ");
  await user.click(screen.getByRole("button", { name: "Entrar na jornada" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normaliza o e-mail e preserva a senha ao direcionar o participante", async () => {
    loginMock.mockResolvedValue({
      csrfToken: "csrf-token",
      user: createUser("PARTICIPANT"),
    });
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        email: "davi@example.com",
        password: "        ",
      }),
    );
    expect(screen.queryByLabelText(/^cpf$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /recuper/i })).not.toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith("/home");
  });

  it("expõe erros de validação sem chamar o serviço", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Entrar na jornada" }));

    expect(await screen.findAllByRole("alert")).toHaveLength(2);
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("exibe apenas e-mail e senha no formulário de participante", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText(/^e-?mail$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^senha$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^cpf$/i)).not.toBeInTheDocument();
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

  it("direciona participante com reset pendente para a troca obrigatória", async () => {
    loginMock.mockResolvedValue({
      csrfToken: "csrf-token",
      user: createParticipantWithRequiredPassword(),
    });
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/trocar-senha"),
    );
  });
});
