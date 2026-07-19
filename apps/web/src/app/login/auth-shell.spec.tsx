import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthShell } from "./auth-shell";

vi.mock("@/components/semcomp/brand-logo", () => ({
  BrandLogo: () => <span aria-label="SEMCOMP 2026" role="img" />,
}));

describe("AuthShell", () => {
  it("apresenta a entrada editorial da jornada sem o visual arcade legado", () => {
    const { container } = render(
      <AuthShell
        description="Entre para acompanhar conquistas, posição e recompensas."
        eyebrow="checkpoint de entrada"
        title="Sua jornada começa aqui."
      >
        <p>Formulário</p>
      </AuthShell>,
    );

    expect(
      screen.getByRole("heading", { name: "Sua jornada começa aqui." }),
    ).toBeInTheDocument();
    expect(screen.getByText("checkpoint de entrada")).toBeInTheDocument();
    expect(container.querySelector(".auth-orbit-stage")).toBeInTheDocument();
    expect(container.querySelector(".arcade-grid")).not.toBeInTheDocument();
    expect(container.querySelector(".scanline")).not.toBeInTheDocument();
  });
});
