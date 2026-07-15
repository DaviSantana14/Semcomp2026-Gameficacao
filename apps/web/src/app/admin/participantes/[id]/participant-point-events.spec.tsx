import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminParticipantPointEvent } from "@/features/participants/participants.types";
import { getPointEventOriginLabel } from "@/features/participants/point-event-labels";
import { PointEvent } from "./participant-point-events";

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
