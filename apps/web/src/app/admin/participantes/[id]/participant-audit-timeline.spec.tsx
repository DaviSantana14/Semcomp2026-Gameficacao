import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchParticipantAuditEvents } from "@/features/audit/audit.service";
import { renderWithQueryClient } from "@/test/render";
import {
  ParticipantAuditTimeline,
  TimelineError,
} from "./participant-audit-timeline";

vi.mock("@/features/audit/audit.service", () => ({
  fetchParticipantAuditEvents: vi.fn(),
}));

const fetchTimeline = vi.mocked(fetchParticipantAuditEvents);

describe("participant audit timeline", () => {
  beforeEach(() => fetchTimeline.mockReset());

  it("renders only explicitly safe snapshot fields", async () => {
    fetchTimeline.mockResolvedValue({
      items: [
        {
          id: "audit-1",
          actorType: "ADMIN",
          actorAdminId: "admin-1",
          participantId: "participant-1",
          operation: "PARTICIPANT_BALANCE_ADJUSTED",
          entityType: "POINT_EVENT",
          entityId: "event-1",
          reason: "Correcao operacional",
          before: null,
          after: { points: 42, passwordHash: "segredo", headers: "segredo" },
          metadata: { token: "segredo" },
          requestId: "request-1",
          createdAt: "2026-07-15T10:00:00.000Z",
        },
      ],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    renderWithQueryClient(
      <ParticipantAuditTimeline participantId="participant-1" />,
    );
    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.queryByText("segredo")).not.toBeInTheDocument();
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/headers/i)).not.toBeInTheDocument();
  });

  it("contains its own failure and exposes retry", () => {
    renderWithQueryClient(<TimelineError fetching={false} retry={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/demais dados continuam disponíveis/i),
    ).toBeInTheDocument();
  });
});
