import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMe } from "@/hooks/use-auth";
import { AdminShell } from "./admin-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/movimentacoes",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/hooks/use-auth", () => ({ useMe: vi.fn() }));
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button type="button">Sair</button>,
}));
vi.mock("@/components/semcomp/brand-logo", () => ({
  BrandLogo: () => <span aria-label="SEMCOMP 2026" role="img" />,
}));

const useMeMock = vi.mocked(useMe);

describe("AdminShell", () => {
  beforeEach(() => {
    useMeMock.mockReturnValue({
      data: { id: "admin-1", name: "Admin", email: "admin@example.com", role: "ADMIN" },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useMe>);
  });

  it("limita a navegação horizontal ao viewport em telas estreitas", () => {
    const { container } = render(<AdminShell><p>Conteúdo</p></AdminShell>);

    expect(container.firstElementChild).toHaveClass(
      "w-full",
      "max-w-full",
      "overflow-x-hidden",
    );
    expect(container.querySelector("aside")).toHaveClass("min-w-0");
    expect(screen.getByRole("navigation", { name: "Áreas administrativas" })).toHaveClass(
      "min-w-0",
      "w-full",
      "max-w-full",
      "overflow-x-auto",
    );
  });

  it("apresenta a administração como parte da SEMCOMP", () => {
    render(
      <AdminShell>
        <p>Conteúdo</p>
      </AdminShell>,
    );

    expect(
      screen.getByRole("img", { name: "SEMCOMP 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Administração SEMCOMP")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Visão geral/ })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(screen.queryByText("Semcomp OS")).not.toBeInTheDocument();
    expect(screen.queryByText("Console admin")).not.toBeInTheDocument();
    expect(screen.queryByText("OPERADOR // ONLINE")).not.toBeInTheDocument();
  });

  it("marca movimentações como a área ativa", () => {
    render(<AdminShell><p>Conteúdo</p></AdminShell>);

    expect(screen.getByRole("link", { name: /Movimentações/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
