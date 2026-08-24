import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetParticipantPassword } from "@/features/participants/participants.service";
import type { AdminParticipantDetail } from "@/features/participants/participants.types";
import { useMe } from "@/hooks/use-auth";
import { renderWithQueryClient } from "@/test/render";
import { ParticipantPasswordResetCard } from "./participant-password-reset-card";

vi.mock("@/features/participants/participants.service", () => ({
  resetParticipantPassword: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useMe: vi.fn(),
}));

const resetMock = vi.mocked(resetParticipantPassword);
const useMeMock = vi.mocked(useMe);

const participant: AdminParticipantDetail = {
  id: "participant-1",
  name: "Ana Silva",
  cpf: "12345678901",
  email: "ana@example.com",
  points: 100,
  xp: 50,
  level: 1,
  isActive: true,
  passwordResetRequired: false,
  passwordResetExpiresAt: null,
  lastLoginAt: null,
  actionRedemptionsCount: 2,
  pendingRewardRedemptionsCount: 1,
  createdAt: "2026-08-23T12:00:00.000Z",
  updatedAt: "2026-08-23T12:00:00.000Z",
  counts: {
    actionRedemptions: 2,
    claimCodes: 0,
    movements: 2,
    rewards: { pending: 1, delivered: 0, cancelled: 0 },
  },
};

function setGeneralUser() {
  useMeMock.mockReturnValue({
    data: {
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
      createdAt: "2026-08-23T12:00:00.000Z",
    },
  } as ReturnType<typeof useMe>);
}

describe("ParticipantPasswordResetCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setGeneralUser();
    resetMock.mockResolvedValue({
      temporaryPassword: "temporary-password",
      expiresAt: "2026-08-24T12:00:00.000Z",
    });
  });

  it("is visible only to general administrators", () => {
    useMeMock.mockReturnValue({
      data: {
        role: "ADMIN",
        adminProfile: "SHOP",
      },
    } as ReturnType<typeof useMe>);

    renderWithQueryClient(<ParticipantPasswordResetCard participant={participant} />);

    expect(screen.queryByRole("region", { name: /reset de senha/i })).not.toBeInTheDocument();
  });

  it("validates the reason, sends replacement, and prevents double submit", async () => {
    let resolve!: (value: {
      temporaryPassword: string;
      expiresAt: string;
    }) => void;
    resetMock.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pendingParticipant = {
      ...participant,
      passwordResetRequired: true,
      passwordResetExpiresAt: "2026-08-24T12:00:00.000Z",
    };
    const user = userEvent.setup();
    renderWithQueryClient(
      <ParticipantPasswordResetCard participant={pendingParticipant} />,
    );

    const submit = screen.getByRole("button", { name: "Gerar senha temporária" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Motivo do reset"), "Reset solicitado pelo suporte");
    await user.click(screen.getByLabelText("Substituir reset pendente"));
    await user.click(submit);
    await user.click(submit);

    expect(resetMock).toHaveBeenCalledOnce();
    expect(resetMock).toHaveBeenCalledWith("participant-1", {
      reason: "Reset solicitado pelo suporte",
      replacePending: true,
    });
    expect(submit).toBeDisabled();
    resolve({
      temporaryPassword: "temporary-password",
      expiresAt: "2026-08-24T12:00:00.000Z",
    });
    expect(await screen.findByText("temporary-password")).toBeInTheDocument();
  });

  it("clears the one-time temporary password and reason when the result closes", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ParticipantPasswordResetCard participant={participant} />);
    await user.type(screen.getByLabelText("Motivo do reset"), "Reset solicitado pelo suporte");
    await user.click(screen.getByRole("button", { name: "Gerar senha temporária" }));

    expect(await screen.findByText("temporary-password")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    await waitFor(() => {
      expect(screen.queryByText("temporary-password")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Motivo do reset")).toHaveValue("");
    });
  });

  it("copies the temporary password without sending it to another state channel", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const previousClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ParticipantPasswordResetCard participant={participant} />,
      );
      await user.type(
        screen.getByLabelText("Motivo do reset"),
        "Reset solicitado pelo suporte",
      );
      await user.click(
        screen.getByRole("button", { name: "Gerar senha temporária" }),
      );
      await user.click(await screen.findByRole("button", { name: "Copiar senha" }));

      expect(
        screen.getByRole("button", { name: "Senha copiada" }),
      ).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: previousClipboard,
      });
    }
  });
});
