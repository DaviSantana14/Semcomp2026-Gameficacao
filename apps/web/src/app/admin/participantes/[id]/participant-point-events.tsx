"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  type AdminParticipantPointEvent,
  type AdminPointEventsFilters,
  fetchAdminParticipantPointEvents,
} from "@/lib/api";
import { PaginationControls } from "../../_components/pagination-controls";

const LIMIT = 10;
const number = new Intl.NumberFormat("pt-BR", { signDisplay: "always" });
const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const SOURCE_LABELS: Record<AdminParticipantPointEvent["source"], string> = {
  ACTION_REDEEM: "Atividade",
  ADMIN_GRANT: "Concessão administrativa",
  ADMIN_ADJUST: "Ajuste administrativo",
  REWARD_REDEMPTION: "Lojinha",
};

export function ParticipantPointEvents({
  participantId,
}: {
  participantId: string;
}) {
  const [page, setPage] = useState(1);
  const [kind, setKind] =
    useState<NonNullable<AdminPointEventsFilters["kind"]>>("all");
  const [source, setSource] =
    useState<NonNullable<AdminPointEventsFilters["source"]>>("all");
  const filters: AdminPointEventsFilters = {
    page,
    limit: LIMIT,
    kind,
    source,
  };
  const query = useQuery({
    queryKey: ["admin", "participant", participantId, "point-events", filters],
    queryFn: () => fetchAdminParticipantPointEvents(participantId, filters),
    retry: false,
  });
  const data = query.data;

  return (
    <Card className="min-w-0 bg-card/90">
      <CardHeader className="gap-4">
        <div>
          <p className="font-mono text-xs uppercase text-primary">
            Conta // razão
          </p>
          <CardTitle className="mt-1">Extrato de pontos</CardTitle>
        </div>
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
      </CardHeader>
      <CardContent className="grid gap-4">
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
            <div className="grid gap-3">
              {data.items.map((event) => (
                <PointEvent event={event} key={event.id} />
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
      </CardContent>
    </Card>
  );
}

function PointEvent({ event }: { event: AdminParticipantPointEvent }) {
  const credit = event.kind === "CREDIT";
  const method = formatRedemptionMethod(event);
  const detail =
    (method ?? event.description?.trim()) || "Sem detalhe adicional";
  return (
    <article className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${credit ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
          >
            {credit ? "Crédito" : "Débito"}
          </span>
          <span className="text-xs text-muted-foreground">
            {SOURCE_LABELS[event.source]}
          </span>
        </div>
        <p className="mt-2 break-words font-bold">
          {event.action?.name ?? SOURCE_LABELS[event.source]}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        <time
          className="mt-2 block font-mono text-xs text-muted-foreground"
          dateTime={event.createdAt}
        >
          {date.format(new Date(event.createdAt))}
        </time>
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

function formatRedemptionMethod(event: AdminParticipantPointEvent) {
  if (event.redemptionMethod === "CLAIM_CODE")
    return event.claimCode
      ? `Código único · ${event.claimCode.code}`
      : "Código único";
  if (event.redemptionMethod === "REUSABLE_CODE")
    return "Código reutilizável";
  if (event.redemptionMethod === "DIRECT") return "Registro direto";
  return null;
}

function Delta({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-background/60 p-3 text-right">
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
        className="min-h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
