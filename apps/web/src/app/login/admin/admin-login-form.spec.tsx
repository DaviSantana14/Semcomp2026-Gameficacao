import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminLogin } from "@/features/auth/auth.service";
import { AdminLoginForm } from "./admin-login-form";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/features/auth/auth.service", () => ({
  adminLogin: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const adminLoginMock = vi.mocked(adminLogin);

describe("AdminLoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("envia CPF, e-mail e senha para a rota administrativa", async () => {
    adminLoginMock.mockResolvedValue({
      csrfToken: "csrf-token",
      user: {
        id: "admin-1",
        name: "Admin",
        cpf: "12345678900",
        email: "admin@example.com",
        role: "ADMIN",
        adminProfile: "GENERAL",
        passwordChangeRequired: false,
        points: 0,
        xp: 0,
        level: 1,
        isActive: true,
        lastLoginAt: null,
        createdAt: "2026-07-30T12:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText("CPF"), "123.456.789-00");
    await user.type(screen.getByLabelText("E-mail"), "Admin@Example.com");
    await user.type(screen.getByLabelText("Senha"), "correct-password");
    await user.click(
      screen.getByRole("button", { name: "Entrar como administrador" }),
    );

    await waitFor(() =>
      expect(adminLoginMock).toHaveBeenCalledWith({
        cpf: "12345678900",
        email: "admin@example.com",
        password: "correct-password",
      }),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/admin"));
  });

  it.each([
    ["SHOP", "/admin/lojinha"],
    ["ACTIVITIES", "/admin/atividades"],
  ] as const)("lands a %s administrator on the first permitted area", async (adminProfile, route) => {
    adminLoginMock.mockResolvedValue({
      csrfToken: "csrf-token",
      user: {
        id: "admin-1",
        name: "Admin",
        cpf: "12345678900",
        email: "admin@example.com",
        role: "ADMIN",
        adminProfile,
        passwordChangeRequired: false,
        points: 0,
        xp: 0,
        level: 1,
        isActive: true,
        lastLoginAt: null,
        createdAt: "2026-07-30T12:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText("CPF"), "12345678900");
    await user.type(screen.getByLabelText("E-mail"), "admin@example.com");
    await user.type(screen.getByLabelText("Senha"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Entrar como administrador" }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(route));
  });

  it("valida CPF, e-mail e senha antes de chamar o serviço", async () => {
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.click(
      screen.getByRole("button", { name: "Entrar como administrador" }),
    );

    expect(await screen.findAllByRole("alert")).toHaveLength(3);
    expect(adminLoginMock).not.toHaveBeenCalled();
  });

  it("preserva o mínimo administrativo de 12 caracteres", async () => {
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText("CPF"), "12345678900");
    await user.type(screen.getByLabelText("E-mail"), "admin@example.com");
    await user.type(screen.getByLabelText("Senha"), "12345678901");
    await user.click(
      screen.getByRole("button", { name: "Entrar como administrador" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /12 e 64 caracteres/i,
    );
    expect(adminLoginMock).not.toHaveBeenCalled();
  });
});
