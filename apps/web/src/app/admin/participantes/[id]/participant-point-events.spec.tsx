import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminParticipantPointEvent } from "@/features/participants/participants.types";
import { getPointEventOriginLabel } from "@/features/participants/point-event-labels";
import { ParticipantPointEvents, PointEvent } from "./participant-point-events";

const services = vi.hoisted(() => ({ fetch: vi.fn(), reverse: vi.fn() }));
vi.mock("@/features/participants/participants.service", () => ({
  fetchAdminParticipantPointEvents: services.fetch,
}));
vi.mock("@/features/reconciliation/reconciliation.service", () => ({
  reverseParticipantPointEvent: services.reverse,
}));

const baseEvent: AdminParticipantPointEvent = {
  id: "event-1",
  points: 30,
  xpDelta: 7,
  kind: "CREDIT",
  source: "ACTION_REDEEM",
  redemptionMethod: "LEGACY_UNKNOWN",
  description: null,
  origin: "LEGACY_UNKNOWN",
  isAudited: false,
  action: { id: "action-1", name: "Check-in" },
  claimCode: null,
  reversalOfPointEventId: null,
  reversalPointEventId: null,
  createdAt: "2026-07-12T12:00:00.000Z",
};

describe("participant point-event presentation", () => {
  it("uses the exact honest label for unknown historical origin", () => {
    expect(getPointEventOriginLabel(baseEvent.origin)).toBe(
      "Origem histórica desconhecida",
    );

    render(<PointEvent event={baseEvent} />);

    expect(
      screen.getByText("Origem histórica desconhecida"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Registro direto")).not.toBeInTheDocument();
    expect(screen.getByText("Sem auditoria histórica")).toBeInTheDocument();
    expect(screen.getByText("+7")).toBeInTheDocument();
  });

  it("renders an administrative adjustment from its real source", () => {
    const adjustment: AdminParticipantPointEvent = {
      ...baseEvent,
      id: "event-admin",
      source: "ADMIN_ADJUST",
      redemptionMethod: null,
      origin: "ADMIN",
      isAudited: true,
      action: null,
      description: "Correção operacional",
    };

    render(<PointEvent event={adjustment} />);

    expect(screen.getAllByText("Ajuste administrativo")).toHaveLength(2);
    expect(screen.getByText("Correção operacional")).toBeInTheDocument();
    expect(screen.queryByText("Atividade")).not.toBeInTheDocument();
    expect(screen.queryByText("Registro direto")).not.toBeInTheDocument();
  });

  it("offers reversal only for an audited, unreversed administrative event", () => {
    const adjustment: AdminParticipantPointEvent = {
      ...baseEvent,
      source: "ADMIN_ADJUST",
      origin: "ADMIN",
      isAudited: true,
      action: null,
    };
    const onReverse = vi.fn();
    render(<PointEvent event={adjustment} onReverse={onReverse} />);
    fireEvent.click(screen.getByRole("button", { name: "Estornar ajuste" }));
    expect(onReverse).toHaveBeenCalledWith(adjustment);
  });

  it("never offers reversal for ledger-only reconciliation compensation", () => {
    render(
      <PointEvent
        event={{
          ...baseEvent,
          source: "ADMIN_ADJUST",
          origin: "RECONCILIATION_COMPENSATION",
          isAudited: true,
          action: null,
        }}
        onReverse={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Estornar ajuste" }),
    ).not.toBeInTheDocument();
  });
});

describe("participant point-event reversal flow", () => {
  const adjustment: AdminParticipantPointEvent = {
    ...baseEvent,
    source: "ADMIN_ADJUST",
    origin: "ADMIN",
    isAudited: true,
    action: null,
  };

  beforeEach(() => {
    services.fetch.mockResolvedValue({
      items: [adjustment],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    services.reverse.mockReset();
  });

  it.each([
    [false, "Estorno compensatório registrado."],
    [
      true,
      "Este estorno já havia sido registrado; nenhum evento foi duplicado.",
    ],
  ])(
    "handles reversal replay=%s and invalidates ranking for XP",
    async (replayed, message) => {
      services.reverse.mockResolvedValue({
        before: { points: 50, xp: 20 },
        after: { points: 20, xp: 13 },
        pointEvent: {
          id: "reversal-1",
          pointsDelta: -30,
          xpDelta: -7,
          kind: "DEBIT",
          source: "ADMIN_ADJUST",
          reversalOfPointEventId: adjustment.id,
          createdAt: "2026-07-15T10:00:00.000Z",
        },
        auditEvent: {
          id: "audit-1",
          operation: "PARTICIPANT_BALANCE_ADJUSTMENT_REVERSED",
          requestId: "request-1",
          createdAt: "2026-07-15T10:00:00.000Z",
        },
        replayed,
      });
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      render(
        <ParticipantPointEvents
          balance={{ points: 50, xp: 20 }}
          participantId="participant-1"
        />,
        { wrapper },
      );
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("button", { name: "Estornar ajuste" }),
      );
      expect(screen.getByText("Saldo após estorno")).toBeInTheDocument();
      await user.type(screen.getByLabelText("Motivo"), "Estorno operacional");
      await user.click(
        screen.getByLabelText(
          "Revisei o evento original e os saldos do estorno",
        ),
      );
      await user.click(
        screen.getByRole("button", { name: "Confirmar estorno" }),
      );
      expect(await screen.findByRole("status")).toHaveTextContent(message);
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["ranking"],
        exact: true,
      });
    },
  );
});
