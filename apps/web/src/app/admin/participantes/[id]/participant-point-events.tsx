"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAdminParticipantPointEvents } from "@/features/participants/participants.service";
import {
  createIdempotencyLifecycle,
  invalidateParticipantOperationQueries,
} from "@/features/participants/participant-operations";
import { participantQueryKeys } from "@/features/participants/participant-query-keys";
import {
  formatPointEventDetail,
  getPointEventSourceLabel,
} from "@/features/participants/point-event-labels";
import type {
  AdminParticipantPointEvent,
  AdminPointEventsFilters,
} from "@/features/participants/participants.types";
import { ApiError } from "@/lib/http/api-error";
import { reverseParticipantPointEvent } from "@/features/reconciliation/reconciliation.service";
import { PaginationControls } from "../../_components/pagination-controls";
import {
  AdminPanel,
  AdminSectionHeader,
  adminSelectClassName,
} from "../../_components/admin-page";
import { ReversalDialog } from "./participant-operation-dialogs";

const LIMIT = 10;
const number = new Intl.NumberFormat("pt-BR", { signDisplay: "always" });
const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
export function ParticipantPointEvents({
  balance,
  participantId,
}: {
  balance: { points: number; xp: number };
  participantId: string;
}) {
  const [page, setPage] = useState(1);
  const [kind, setKind] =
    useState<NonNullable<AdminPointEventsFilters["kind"]>>("all");
  const [source, setSource] =
    useState<NonNullable<AdminPointEventsFilters["source"]>>("all");
  const [selected, setSelected] = useState<AdminParticipantPointEvent | null>(
    null,
  );
  const [feedback, setFeedback] = useState<"created" | "replayed" | null>(null);
  const lifecycle = useRef(createIdempotencyLifecycle()).current;
  const queryClient = useQueryClient();
  const reversal = useMutation({
    mutationFn: ({
      id,
      reason,
      idempotencyKey,
    }: {
      id: string;
      reason: string;
      idempotencyKey: string;
    }) => reverseParticipantPointEvent(id, { reason, idempotencyKey }),
  });
  const filters: AdminPointEventsFilters = {
    page,
    limit: LIMIT,
    kind,
    source,
  };
  const query = useQuery({
    queryKey: [...participantQueryKeys.pointEvents(participantId), filters],
    queryFn: () => fetchAdminParticipantPointEvents(participantId, filters),
    retry: false,
  });
  const data = query.data;

  async function reverse(reason: string) {
    if (!selected) return;
    const fingerprint = JSON.stringify({ eventId: selected.id, reason });
    const idempotencyKey = lifecycle.keyFor(fingerprint);
    try {
      const result = await reversal.mutateAsync({
        id: selected.id,
        reason,
        idempotencyKey,
      });
      lifecycle.succeeded();
      setFeedback(result.replayed ? "replayed" : "created");
      setSelected(null);
      await invalidateParticipantOperationQueries(
        queryClient,
        participantId,
        selected.xpDelta !== 0,
      );
    } catch (error) {
      lifecycle.failed(error instanceof ApiError && error.status === 409);
      throw error;
    }
  }

  return (
    <AdminPanel
      aria-labelledby="point-events-title"
      className="overflow-hidden"
    >
      <div className="grid gap-5 border-b border-border/80 px-5 py-5 md:px-6">
        <AdminSectionHeader
          description="Créditos, débitos, ajustes e estornos registrados para esta conta."
          eyebrow="conta // razão"
          id="point-events-title"
          title="Extrato de pontos"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Filter
            label="Movimento"
            onChange={(value) => {
              setKind(value as typeof kind);
              setPage(1);
            }}
            value={kind}
          >
            <option value="all">Todos</option>
            <option value="credit">Créditos</option>
            <option value="debit">Débitos</option>
          </Filter>
          <Filter
            label="Origem"
            onChange={(value) => {
              setSource(value as typeof source);
              setPage(1);
            }}
            value={source}
          >
            <option value="all">Todas</option>
            <option value="action_redeem">Atividade</option>
            <option value="admin_grant">Concessão administrativa</option>
            <option value="admin_adjust">Ajuste administrativo</option>
            <option value="reward_redemption">Lojinha</option>
          </Filter>
        </div>
      </div>
      <div className="grid gap-4 p-5 md:p-6">
        {feedback ? (
          <p
            className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success"
            role="status"
          >
            {feedback === "replayed"
              ? "Este estorno já havia sido registrado; nenhum evento foi duplicado."
              : "Estorno compensatório registrado."}
          </p>
        ) : null}
        {query.isLoading ? (
          <SectionSkeleton />
        ) : query.error ? (
          <SectionError
            error={query.error}
            fetching={query.isFetching}
            retry={() => void query.refetch()}
          />
        ) : data && data.items.length > 0 ? (
          <>
            <div className="divide-y divide-border/80 border-y border-border/80">
              {data.items.map((event) => (
                <PointEvent
                  event={event}
                  key={event.id}
                  onReverse={setSelected}
                />
              ))}
            </div>
            <PaginationControls
              onPageChange={setPage}
              page={data.meta.page}
              totalPages={data.meta.totalPages}
            />
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
            Nenhuma movimentação corresponde aos filtros.
          </div>
        )}
      </div>
      {selected ? (
        <ReversalDialog
          balance={balance}
          event={{
            pointsDelta:
              selected.kind === "CREDIT"
                ? Math.abs(selected.points)
                : -Math.abs(selected.points),
            xpDelta: selected.xpDelta,
          }}
          onClose={() => setSelected(null)}
          onSubmit={reverse}
        />
      ) : null}
    </AdminPanel>
  );
}

export function PointEvent({
  event,
  onReverse,
}: {
  event: AdminParticipantPointEvent;
  onReverse?: (event: AdminParticipantPointEvent) => void;
}) {
  const credit = event.kind === "CREDIT";
  const detail = formatPointEventDetail(event) ?? "Sem detalhe adicional";
  return (
    <article
      className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
      id={`point-event-${event.id}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${credit ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
          >
            {credit ? "Crédito" : "Débito"}
          </span>
          <span className="text-xs text-muted-foreground">
            {getPointEventSourceLabel(event.source)}
          </span>
        </div>
        <p className="mt-2 break-words font-bold">
          {event.action?.name ?? getPointEventSourceLabel(event.source)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        {!event.isAudited &&
        (event.origin === "LEGACY_UNKNOWN" ||
          event.source === "ADMIN_GRANT" ||
          event.source === "ADMIN_ADJUST") ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Sem auditoria histórica
          </p>
        ) : null}
        <time
          className="mt-2 block font-mono text-xs text-muted-foreground"
          dateTime={event.createdAt}
        >
          {date.format(new Date(event.createdAt))}
        </time>
        {event.reversalOfPointEventId ? (
          <a
            className="mt-2 inline-block text-xs font-semibold text-primary underline"
            href={`#point-event-${event.reversalOfPointEventId}`}
          >
            Compensa evento original
          </a>
        ) : event.reversalPointEventId ? (
          <a
            className="mt-2 inline-block text-xs font-semibold text-primary underline"
            href={`#point-event-${event.reversalPointEventId}`}
          >
            Ver evento de estorno
          </a>
        ) : null}
        {onReverse && isReversalEligible(event) ? (
          <Button
            className="mt-3"
            onClick={() => onReverse(event)}
            variant="outline"
          >
            <RotateCcw />
            Estornar ajuste
          </Button>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-2 md:min-w-48">
        <Delta
          label="PTS"
          value={credit ? Math.abs(event.points) : -Math.abs(event.points)}
        />
        <Delta label="XP" value={event.xpDelta} />
      </dl>
    </article>
  );
}

export function isReversalEligible(event: AdminParticipantPointEvent) {
  return (
    event.isAudited &&
    event.origin === "ADMIN" &&
    (event.source === "ADMIN_GRANT" || event.source === "ADMIN_ADJUST") &&
    !event.reversalOfPointEventId &&
    !event.reversalPointEventId
  );
}

function Delta({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[11px] border border-border/70 bg-background/45 p-3 text-right">
      <dt className="font-mono text-[10px] uppercase text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1 font-mono text-lg font-black tabular-nums ${value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground"}`}
      >
        {number.format(value)}
      </dd>
    </div>
  );
}
function Filter({
  children,
  label,
  onChange,
  value,
}: {
  children: React.ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = `events-${label.toLowerCase()}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        className={adminSelectClassName}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </div>
  );
}
function SectionSkeleton() {
  return (
    <div aria-label="Carregando extrato" className="grid gap-3" role="status">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton className="h-32" key={index} />
      ))}
    </div>
  );
}
function SectionError({
  error,
  fetching,
  retry,
}: {
  error: Error;
  fetching: boolean;
  retry: () => void;
}) {
  return (
    <div
      className="grid justify-items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
      role="alert"
    >
      <div>
        <p className="font-bold">Não foi possível carregar o extrato</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof ApiError ? error.message : "Tente novamente."}
        </p>
      </div>
      <Button disabled={fetching} onClick={retry} variant="outline">
        <RotateCcw aria-hidden="true" />
        {fetching ? "Consultando..." : "Tentar novamente"}
      </Button>
    </div>
  );
}
