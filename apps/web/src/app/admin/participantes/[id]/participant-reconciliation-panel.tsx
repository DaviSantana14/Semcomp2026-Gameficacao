"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RefreshCcw, Scale, Wrench } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createIdempotencyLifecycle,
  invalidateParticipantOperationQueries,
} from "@/features/participants/participant-operations";
import { participantQueryKeys } from "@/features/participants/participant-query-keys";
import {
  confirmParticipantReconciliation,
  createParticipantAdjustment,
  fetchParticipantReconciliation,
} from "@/features/reconciliation/reconciliation.service";
import type {
  BalanceOperationResult,
  ReconciliationConfirmationResult,
} from "@/features/reconciliation/reconciliation.types";
import { ApiError } from "@/lib/http/api-error";
import {
  AdjustmentDialog,
  ReconciliationConfirmationDialog,
} from "./participant-operation-dialogs";
import { AdminPanel, AdminSectionHeader } from "../../_components/admin-page";

const number = new Intl.NumberFormat("pt-BR", { signDisplay: "always" });

export function ParticipantReconciliationPanel({
  balance,
  participantId,
}: {
  balance: { points: number; xp: number };
  participantId: string;
}) {
  const qc = useQueryClient();
  const adjustmentLifecycle = useRef(createIdempotencyLifecycle()).current;
  const confirmationLifecycle = useRef(createIdempotencyLifecycle()).current;
  const [dialog, setDialog] = useState<"adjust" | "confirm" | null>(null);
  const [prepared, setPrepared] = useState({ pointsDelta: 0, xpDelta: 0 });
  const [feedback, setFeedback] = useState<
    BalanceOperationResult | ReconciliationConfirmationResult | null
  >(null);
  const query = useQuery({
    queryKey: participantQueryKeys.reconciliation(participantId),
    queryFn: () => fetchParticipantReconciliation(participantId),
    retry: false,
  });
  const adjustment = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof createParticipantAdjustment>[1];
    }) => createParticipantAdjustment(id, payload),
  });
  const confirmation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof confirmParticipantReconciliation>[1];
    }) => confirmParticipantReconciliation(id, payload),
  });

  async function adjust(value: {
    pointsDelta: number;
    xpDelta: number;
    reason: string;
  }) {
    const fingerprint = JSON.stringify({ participantId, ...value });
    const idempotencyKey = adjustmentLifecycle.keyFor(fingerprint);
    try {
      const result = await adjustment.mutateAsync({
        id: participantId,
        payload: { ...value, idempotencyKey },
      });
      adjustmentLifecycle.succeeded();
      setFeedback(result);
      setDialog(null);
      await invalidateParticipantOperationQueries(
        qc,
        participantId,
        value.xpDelta !== 0,
      );
    } catch (error) {
      adjustmentLifecycle.failed(
        error instanceof ApiError && error.status === 409,
      );
      throw error;
    }
  }

  async function confirm(reason: string) {
    if (!query.data) return;
    const fingerprint = JSON.stringify({
      participantId,
      reason,
      points: query.data.pointsDifference,
      xp: query.data.xpDifference,
    });
    const idempotencyKey = confirmationLifecycle.keyFor(fingerprint);
    try {
      const result = await confirmation.mutateAsync({
        id: participantId,
        payload: { reason, idempotencyKey },
      });
      confirmationLifecycle.succeeded();
      setFeedback(result);
      setDialog(null);
      await invalidateParticipantOperationQueries(
        qc,
        participantId,
        query.data.xpDifference !== 0,
      );
    } catch (error) {
      confirmationLifecycle.failed(
        error instanceof ApiError && error.status === 409,
      );
      throw error;
    }
  }

  return (
    <AdminPanel
      aria-labelledby="reconciliation-title"
      className="overflow-hidden"
    >
      <AdminSectionHeader
        className="border-b border-border/80 px-5 py-5 md:px-6"
        description="Compare o saldo atual com o histórico de movimentações antes de ajustar."
        eyebrow="integridade // saldo"
        id="reconciliation-title"
        title="Reconciliação de saldo"
      />
      <div className="grid gap-5 p-5 md:p-6">
        {query.isLoading ? (
          <Skeleton className="h-40" />
        ) : query.error ? (
          <PanelError
            fetching={query.isFetching}
            message="Não foi possível verificar a integridade do saldo."
            retry={() => void query.refetch()}
          />
        ) : query.data ? (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-[13px] border border-border/70 bg-background/35 px-4 py-3">
              {query.data.status === "CONSISTENT" ? (
                <CheckCircle2 className="size-5 text-success" />
              ) : (
                <Scale className="size-5 text-warning" />
              )}
              <p className="font-semibold">
                {query.data.status === "CONSISTENT"
                  ? "Saldo consistente"
                  : "Divergência encontrada"}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ReconciliationMetric
                label="Pontos"
                stored={query.data.storedPoints}
                ledger={query.data.ledgerPoints}
                difference={query.data.pointsDifference}
              />
              <ReconciliationMetric
                label="XP"
                stored={query.data.storedXp}
                ledger={query.data.ledgerXp}
                difference={query.data.xpDifference}
              />
            </div>
            {query.data.status === "DIVERGENT" ? (
              <div className="flex flex-col gap-2 border-t border-border/80 pt-4 sm:flex-row">
                <Button
                  onClick={() => {
                    setPrepared({
                      pointsDelta: -query.data.pointsDifference,
                      xpDelta: -query.data.xpDifference,
                    });
                    setDialog("adjust");
                  }}
                  variant="outline"
                >
                  <Wrench />
                  Preparar ajuste do saldo
                </Button>
                <Button onClick={() => setDialog("confirm")}>
                  <Scale />
                  Alinhar somente o histórico
                </Button>
              </div>
            ) : (
              <Button
                className="w-fit"
                onClick={() => {
                  setPrepared({ pointsDelta: 0, xpDelta: 0 });
                  setDialog("adjust");
                }}
                variant="outline"
              >
                <Wrench />
                Novo ajuste
              </Button>
            )}
            {feedback ? (
              <p
                className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success"
                role="status"
              >
                {feedback.replayed
                  ? "A tentativa já havia sido registrada; nenhum novo lançamento foi criado."
                  : "Operação registrada e consultas atualizadas."}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sem dados de reconciliação.
          </p>
        )}
      </div>
      {dialog === "adjust" ? (
        <AdjustmentDialog
          balance={balance}
          initialDeltas={prepared}
          onClose={() => setDialog(null)}
          onSubmit={adjust}
          open
        />
      ) : null}
      {dialog === "confirm" && query.data ? (
        <ReconciliationConfirmationDialog
          deltas={{
            points: query.data.pointsDifference,
            xp: query.data.xpDifference,
          }}
          onClose={() => setDialog(null)}
          onSubmit={confirm}
        />
      ) : null}
    </AdminPanel>
  );
}

function ReconciliationMetric({
  difference,
  label,
  ledger,
  stored,
}: {
  difference: number;
  label: string;
  ledger: number;
  stored: number;
}) {
  return (
    <dl className="grid grid-cols-3 divide-x divide-border/80 rounded-[13px] border border-border/80 bg-muted/20 py-4">
      <div className="px-3">
        <dt className="text-xs text-muted-foreground">{label} armazenado</dt>
        <dd className="mt-1 font-mono font-bold">
          {stored.toLocaleString("pt-BR")}
        </dd>
      </div>
      <div className="px-3">
        <dt className="text-xs text-muted-foreground">No histórico</dt>
        <dd className="mt-1 font-mono font-bold">
          {ledger.toLocaleString("pt-BR")}
        </dd>
      </div>
      <div className="px-3">
        <dt className="text-xs text-muted-foreground">Diferença</dt>
        <dd
          className={
            difference === 0
              ? "mt-1 font-mono font-bold text-success"
              : "mt-1 font-mono font-bold text-warning"
          }
        >
          {number.format(difference)}
        </dd>
      </div>
    </dl>
  );
}
function PanelError({
  fetching,
  message,
  retry,
}: {
  fetching: boolean;
  message: string;
  retry: () => void;
}) {
  return (
    <div
      className="grid justify-items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
      role="alert"
    >
      <p className="text-sm">{message}</p>
      <Button disabled={fetching} onClick={retry} variant="outline">
        <RefreshCcw />
        {fetching ? "Consultando..." : "Tentar novamente"}
      </Button>
    </div>
  );
}
