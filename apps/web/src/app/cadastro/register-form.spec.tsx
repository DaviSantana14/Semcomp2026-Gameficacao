import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginResponse } from "@/features/auth/auth.types";
import { setCsrfToken } from "@/lib/http/csrf";
import { apiFetch } from "@/lib/http/client";
import { RegisterForm } from "./register-form";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/http/client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/http/csrf", () => ({
  clearCsrfToken: vi.fn(),
  setCsrfToken: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);
const setCsrfTokenMock = vi.mocked(setCsrfToken);

const registerResponse: LoginResponse = {
  csrfToken: "csrf-token",
  user: {
    id: "participant-1",
    name: "Ada Lovelace",
    cpf: "12345678900",
    email: "ada@example.com",
    role: "PARTICIPANT",
    points: 0,
    xp: 0,
    level: 1,
    isActive: true,
    lastLoginAt: null,
    createdAt: "2026-08-21T12:00:00.000Z",
  },
};

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue(registerResponse);
  });

  it("registra com senha, armazena o CSRF e entra sem uma segunda requisição", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Nome"), "Ada Lovelace");
    await user.type(screen.getByLabelText("CPF"), "123.456.789-00");
    await user.type(screen.getByLabelText(/^e-?mail$/i), "Ada@Example.com");
    await user.type(screen.getByLabelText(/^senha$/i), "senha livre");
    await user.type(screen.getByLabelText(/confirmar senha/i), "senha livre");
    await user.click(screen.getByRole("button", { name: /criar e entrar/i }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Ada Lovelace",
        cpf: "12345678900",
        email: "ada@example.com",
        password: "senha livre",
      }),
      skipCsrf: true,
    });
    expect(setCsrfTokenMock).toHaveBeenCalledWith("csrf-token");
    expect(replaceMock).toHaveBeenCalledWith("/home");
  });

  it("não envia a confirmação nem aceita senhas diferentes", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Nome"), "Ada Lovelace");
    await user.type(screen.getByLabelText("CPF"), "12345678900");
    await user.type(screen.getByLabelText(/^e-?mail$/i), "ada@example.com");
    await user.type(screen.getByLabelText(/^senha$/i), "senha livre");
    await user.type(screen.getByLabelText(/confirmar senha/i), "outra senha");
    await user.click(screen.getByRole("button", { name: /criar e entrar/i }));

    expect(await screen.findByText("As senhas precisam ser iguais.")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
