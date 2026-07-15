import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { ParticipantReconciliationPanel } from "./participant-reconciliation-panel";

const services = vi.hoisted(() => ({
  adjust: vi.fn(),
  confirm: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/features/reconciliation/reconciliation.service", () => ({
  confirmParticipantReconciliation: services.confirm,
  createParticipantAdjustment: services.adjust,
  fetchParticipantReconciliation: services.fetch,
}));

const reconciliation = {
  participantId: "participant-1",
  name: "Ada",
  email: "ada@example.com",
  storedPoints: 30,
  ledgerPoints: 30,
  pointsDifference: 0,
  storedXp: 8,
  ledgerXp: 8,
  xpDifference: 0,
  status: "CONSISTENT" as const,
  lastEventAt: null,
};

function result(replayed = false) {
  return {
    before: { points: 30, xp: 8 },
    after: { points: 35, xp: 8 },
    pointEvent: {
      id: "event-1",
      pointsDelta: 5,
      xpDelta: 0,
      kind: "CREDIT" as const,
      source: "ADMIN_ADJUST" as const,
      createdAt: "2026-07-15T10:00:00.000Z",
    },
    auditEvent: {
      id: "audit-1",
      operation: "PARTICIPANT_BALANCE_ADJUSTED" as const,
      requestId: "request-1",
      createdAt: "2026-07-15T10:00:00.000Z",
    },
    replayed,
  };
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(
    <ParticipantReconciliationPanel
      balance={{ points: 30, xp: 8 }}
      participantId="participant-1"
    />,
    { wrapper },
  );
  return { invalidate };
}

async function fillAdjustment() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Novo ajuste" }));
  const points = screen.getByLabelText("Delta de pontos");
  await user.clear(points);
  await user.type(points, "5");
  await user.type(screen.getByLabelText("Motivo"), "Correcao operacional");
  await user.click(screen.getByLabelText("Revisei os saldos previstos"));
  return { user, reason: screen.getByLabelText("Motivo") };
}

describe("participant reconciliation operations", () => {
  beforeEach(() => {
    services.fetch.mockResolvedValue(reconciliation);
    services.adjust.mockReset();
    services.confirm.mockReset();
  });

  it.each([
    [false, "Operação registrada e consultas atualizadas."],
    [
      true,
      "A tentativa já havia sido registrada; nenhum novo lançamento foi criado.",
    ],
  ])(
    "handles adjustment replay=%s and invalidates only the expected queries",
    async (replayed, message) => {
      services.adjust.mockResolvedValue(result(replayed));
      const { invalidate } = setup();
      const { user } = await fillAdjustment();
      await user.click(
        screen.getByRole("button", { name: "Confirmar ajuste" }),
      );
      expect(await screen.findByRole("status")).toHaveTextContent(message);
      const calls = invalidate.mock.calls.map(([filters]) => filters);
      expect(calls).toEqual(
        expect.arrayContaining([
          { queryKey: ["admin", "participant", "participant-1"], exact: true },
          { queryKey: ["admin", "dashboard"], exact: true },
        ]),
      );
      expect(calls).not.toContainEqual({ queryKey: ["ranking"], exact: true });
    },
  );

  it.each([
    [new ApiError("Conflito de idempotencia", 409), "Conflito:"],
    [
      new ApiError("Saldo mudou durante a operacao", 422),
      "Saldo mudou durante a operacao",
    ],
  ])("preserves the form for operation errors", async (error, message) => {
    services.adjust.mockRejectedValue(error);
    setup();
    const { user, reason } = await fillAdjustment();
    await user.click(screen.getByRole("button", { name: "Confirmar ajuste" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(reason).toHaveValue("Correcao operacional");
  });

  it("blocks a double submit while the first request is pending", async () => {
    let resolve!: (value: ReturnType<typeof result>) => void;
    services.adjust.mockImplementation(
      () => new Promise((resolvePromise) => (resolve = resolvePromise)),
    );
    setup();
    await fillAdjustment();
    const submit = screen.getByRole("button", { name: "Confirmar ajuste" });
    fireEvent.click(submit);
    await waitFor(() => expect(services.adjust).toHaveBeenCalledTimes(1));
    fireEvent.click(submit);
    expect(services.adjust).toHaveBeenCalledTimes(1);
    resolve(result());
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
