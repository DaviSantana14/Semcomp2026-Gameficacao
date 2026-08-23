import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { User } from "@/features/users/users.types";
import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";
import { ParticipantShell } from "./participant-shell";

vi.mock("@/hooks/use-presence-heartbeat", () => ({
  usePresenceHeartbeat: vi.fn(),
}));

vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button type="button">Sair</button>,
}));

vi.mock("@/components/semcomp/brand-logo", () => ({
  BrandLogo: () => <span aria-label="SEMCOMP 2026" role="img" />,
}));

const participant: User = {
  id: "participant-1",
  name: "Davi Santos",
  cpf: "00000000000",
  email: "davi@example.com",
  role: "PARTICIPANT",
  adminProfile: null,
  passwordChangeRequired: false,
  points: 620,
  xp: 1840,
  level: 7,
  isActive: true,
  lastLoginAt: null,
  createdAt: "2026-07-18T12:00:00.000Z",
};

describe("ParticipantShell", () => {
  it("compartilha a identidade, a navegacao ativa e o perfil do participante", () => {
    render(
      <ParticipantShell activeHref="/ranking" user={participant}>
        <h1>Ranking</h1>
      </ParticipantShell>,
    );

    expect(
      screen.getByRole("img", { name: "SEMCOMP 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ranking" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Início" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      screen.getByRole("heading", { name: "Ranking" }),
    ).toBeInTheDocument();
    expect(screen.getByText(participant.name)).toBeInTheDocument();
    expect(vi.mocked(usePresenceHeartbeat)).toHaveBeenCalledOnce();
  });
});
