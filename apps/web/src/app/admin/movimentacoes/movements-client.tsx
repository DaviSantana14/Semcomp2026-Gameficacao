"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Filter, ListRestart, RefreshCw, SearchX } from "lucide-react";
import { type FormEvent, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getPointEventKindLabel,
  getPointEventOriginLabel,
  getPointEventSourceLabel,
} from "@/features/participants/point-event-labels";
import {
  downloadMovementsExport,
  fetchMovements,
  fetchMovementsExportCount,
} from "@/features/movements/movements.service";
import {
  MOVEMENTS_PAGE_SIZE,
  type AdminPointEventsFilters,
  type MovementExportFilters,
  type PointEventKindFilter,
  type PointEventSourceFilter,
} from "@/features/movements/movements.types";
import type { AdminExportFilter } from "@/features/exports/exports.types";
import { AdminExportDialog } from "../_components/admin-export-dialog";
import { PaginationControls } from "../_components/pagination-controls";
import {
  AdminPageHeader,
  AdminPanel,
  AdminSectionHeader,
  adminSelectClassName,
} from "../_components/admin-page";

type DraftFilters = {
  search: string;
  source: PointEventSourceFilter;
  kind: PointEventKindFilter;
  from: string;
  to: string;
};

const emptyDraft: DraftFilters = {
  search: "",
  source: "all",
  kind: "all",
  from: "",
  to: "",
};

const sourceOptions = [
  ["all", "Todas as origens"],
  ["action_redeem", "Atividades"],
  ["admin_grant", "Concessões administrativas"],
  ["admin_adjust", "Ajustes administrativos"],
  ["reward_redemption", "Lojinha"],
] as const satisfies ReadonlyArray<readonly [PointEventSourceFilter, string]>;

const kindOptions = [
  ["all", "Todos os tipos"],
  ["credit", "Créditos"],
  ["debit", "Débitos"],
] as const satisfies ReadonlyArray<readonly [PointEventKindFilter, string]>;

const operationalDateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function MovementsClient() {
  const [draft, setDraft] = useState<DraftFilters>(emptyDraft);
  const [appliedFilters, setAppliedFilters] =
    useState<MovementExportFilters>({});
  const [page, setPage] = useState(1);
  const [dateError, setDateError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const listFilters = useMemo<AdminPointEventsFilters>(
    () => ({ page, limit: MOVEMENTS_PAGE_SIZE, ...appliedFilters }),
    [appliedFilters, page],
  );
  const query = useQuery({
    queryKey: ["admin", "point-events", listFilters],
    queryFn: () => fetchMovements(listFilters),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const countExport = useCallback(
    () => fetchMovementsExportCount(appliedFilters),
    [appliedFilters],
  );
  const downloadExport = useCallback(
    () => downloadMovementsExport(appliedFilters),
    [appliedFilters],
  );

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidDateRange(draft.from, draft.to)) {
      setDateError("A data inicial deve ser anterior à data final exclusiva.");
      return;
    }
    setDateError(null);
    setAppliedFilters(toAppliedFilters(draft));
    setPage(1);
  }

  function clearFilters() {
    setDraft(emptyDraft);
    setAppliedFilters({});
    setDateError(null);
    setPage(1);
  }

  const hasFilters = Object.keys(appliedFilters).length > 0;
  const data = query.data;

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-8">
      <AdminPageHeader
        action={
          <Button
            aria-label="Exportar movimentações"
            onClick={() => setExportOpen(true)}
            variant="outline"
          >
            <Download aria-hidden="true" />
            Exportar movimentações
          </Button>
        }
        description={
          <p>
            Acompanhe cada entrada e saída de pontos com a origem, a referência
            e o horário operacional do evento.
          </p>
        }
        eyebrow="operação // movimentos"
        title="Movimentações"
      />

      <AdminPanel aria-labelledby="movements-filters-title" className="overflow-hidden">
        <div className="border-b border-border/80 px-4 py-3 md:px-5">
          <h2
            className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-secondary"
            id="movements-filters-title"
          >
            Filtros de movimentações
          </h2>
        </div>
        <form className="grid gap-4 p-4 md:p-5" onSubmit={applyFilters}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="movements-participant" label="Participante">
              <Input
                autoComplete="off"
                id="movements-participant"
                maxLength={100}
                name="participant"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
                placeholder="Nome ou e-mail…"
                value={draft.search}
              />
            </Field>
            <Field id="movements-source" label="Origem">
              <select
                className={adminSelectClassName}
                id="movements-source"
                name="source"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    source: event.target.value as PointEventSourceFilter,
                  }))
                }
                value={draft.source}
              >
                {sourceOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="movements-kind" label="Tipo">
              <select
                className={adminSelectClassName}
                id="movements-kind"
                name="kind"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    kind: event.target.value as PointEventKindFilter,
                  }))
                }
                value={draft.kind}
              >
                {kindOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="movements-from" label="Data inicial">
                <Input
                  autoComplete="off"
                  id="movements-from"
                  name="from"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      from: event.target.value,
                    }))
                  }
                  type="date"
                  value={draft.from}
                />
              </Field>
              <Field id="movements-to" label="Data final exclusiva">
                <Input
                  autoComplete="off"
                  id="movements-to"
                  name="to"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      to: event.target.value,
                    }))
                  }
                  type="date"
                  value={draft.to}
                />
              </Field>
            </div>
          </div>
          {dateError ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {dateError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {hasFilters ? (
              <Button onClick={clearFilters} type="button" variant="ghost">
                <ListRestart aria-hidden="true" />
                Limpar filtros
              </Button>
            ) : null}
            <Button type="submit">
              <Filter aria-hidden="true" />
              Aplicar filtros
            </Button>
          </div>
        </form>
      </AdminPanel>

      {query.isPending ? (
        <p role="status">Carregando movimentações…</p>
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          isFetching={query.isFetching}
          retry={() => void query.refetch()}
        />
      ) : data && data.items.length > 0 ? (
        <section aria-labelledby="movements-result-title" className="grid gap-4">
          <AdminSectionHeader
            action={
              query.isFetching ? (
                <p
                  className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-primary"
                  role="status"
                >
                  Atualizando resultados…
                </p>
              ) : null
            }
            description={
              <p aria-live="polite">
                {data.meta.total.toLocaleString("pt-BR")} movimentação
                {data.meta.total === 1 ? "" : "ões"}
              </p>
            }
            eyebrow="registro // pontos"
            id="movements-result-title"
            title="Eventos encontrados"
          />
          <AdminPanel className="divide-y divide-border/80 overflow-hidden">
            {data.items.map((event) => (
              <MovementRow event={event} key={event.id} />
            ))}
          </AdminPanel>
          <PaginationControls
            onPageChange={setPage}
            page={data.meta.page}
            totalPages={data.meta.totalPages}
          />
        </section>
      ) : (
        <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
      )}

      {exportOpen ? (
        <AdminExportDialog
          appliedFilters={buildAppliedFilterLabels(appliedFilters)}
          count={countExport}
          download={downloadExport}
          onClose={() => setExportOpen(false)}
          title="Exportar movimentações"
        />
      ) : null}
    </div>
  );
}

function Field({
  children,
  id,
  label,
}: {
  children: React.ReactNode;
  id: string;
  label: string;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function MovementRow({
  event,
}: {
  event: import("@/features/movements/movements.types").AdminPointEvent;
}) {
  return (
    <article className="grid min-w-0 gap-4 px-4 py-5 transition-colors hover:bg-muted/25 md:grid-cols-[minmax(0,1fr)_auto] md:px-5">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 break-words text-lg font-semibold">
            {event.participant.name}
          </h3>
          <span className="rounded-full border border-secondary/35 bg-secondary/10 px-2 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-secondary">
            {getPointEventOriginLabel(event.origin)}
          </span>
          <span className="rounded-full border border-border px-2 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {getPointEventKindLabel(event.kind)}
          </span>
          {event.code ? (
            <code
              className="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground"
              spellCheck={false}
              translate="no"
            >
              {event.code}
            </code>
          ) : null}
        </div>
        <p className="mt-1 break-words text-sm text-muted-foreground">
          {event.participant.email}
        </p>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Fonte: </span>
            <span className="font-semibold">
              {getPointEventSourceLabel(event.source)}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">Referência: </span>
            <span className="font-semibold">{event.reference.label}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Ator: </span>
            <span className="font-semibold">
              {event.actor?.name ?? "Sistema"}
            </span>
          </p>
          {event.description ? (
            <p className="break-words text-muted-foreground sm:col-span-2">
              {event.description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid content-start gap-2 text-left md:justify-items-end md:text-right">
        <div className="flex flex-wrap gap-2 md:justify-end">
          <span className="font-mono text-sm font-bold tabular-nums tracking-[0.04em]">
            {formatDelta(event.points, "PTS")}
          </span>
          <span className="font-mono text-sm font-bold tabular-nums tracking-[0.04em] text-muted-foreground">
            {formatDelta(event.xpDelta, "XP")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          <time dateTime={event.createdAt}>
            {operationalDateTime.format(new Date(event.createdAt))}
          </time>
        </p>
      </div>
    </article>
  );
}

function ErrorState({
  error,
  isFetching,
  retry,
}: {
  error: unknown;
  isFetching: boolean;
  retry: () => void;
}) {
  return (
    <div
      className="grid justify-items-start gap-4 rounded-[18px] border border-destructive/40 bg-destructive/5 p-5"
      role="alert"
    >
      <div>
        <h2 className="text-xl font-bold">
          Não foi possível carregar as movimentações
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error
            ? error.message
            : "Verifique sua conexão e tente novamente."}
        </p>
      </div>
      <Button disabled={isFetching} onClick={retry} variant="outline">
        <RefreshCw aria-hidden="true" />
        {isFetching ? "Consultando…" : "Tentar novamente"}
      </Button>
    </div>
  );
}

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="grid justify-items-start gap-4 rounded-[18px] border border-dashed border-border bg-card/70 p-6">
      <SearchX aria-hidden="true" className="size-8 text-primary" />
      <div>
        <h2 className="text-xl font-bold">Nenhuma movimentação encontrada.</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasFilters
            ? "Revise ou remova parte dos filtros aplicados."
            : "Ainda não há eventos de pontos registrados."}
        </p>
      </div>
      {hasFilters ? (
        <Button onClick={onClear} variant="outline">
          Limpar filtros
        </Button>
      ) : null}
    </div>
  );
}

function toAppliedFilters(draft: DraftFilters): MovementExportFilters {
  const filters: MovementExportFilters = {};
  const search = draft.search.trim();
  if (search) filters.search = search;
  if (draft.source !== "all") filters.source = draft.source;
  if (draft.kind !== "all") filters.kind = draft.kind;
  if (draft.from) filters.from = draft.from;
  if (draft.to) filters.to = draft.to;
  return filters;
}

function isValidDateRange(from: string, to: string) {
  return (!from && !to) || Boolean(from && to && from < to);
}

function buildAppliedFilterLabels(
  filters: MovementExportFilters,
): readonly AdminExportFilter[] {
  return [
    { label: "Participante", value: filters.search ?? "Todos" },
    {
      label: "Origem",
      value: sourceOptions.find(([value]) => value === filters.source)?.[1] ?? "Todas",
    },
    {
      label: "Tipo",
      value: kindOptions.find(([value]) => value === filters.kind)?.[1] ?? "Todos",
    },
    {
      label: "Período",
      value:
        filters.from || filters.to
          ? `${filters.from ?? "início"} a ${filters.to ?? "fim exclusivo"}`
          : "Todo o período",
    },
  ];
}

function formatDelta(value: number, unit: "PTS" | "XP") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} ${unit}`;
}
