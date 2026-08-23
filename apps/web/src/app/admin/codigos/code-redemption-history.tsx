"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Filter, ListRestart, RefreshCw, SearchX } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  downloadCodeRedemptionsExport,
  fetchAdminActions,
  fetchCodeRedemptions,
  fetchCodeRedemptionsExportCount,
} from "@/features/actions/actions.service";
import type {
  AdminCodeRedemption,
  AdminCodeRedemptionsFilters,
  CodeRedemptionsExportFilters,
} from "@/features/actions/actions.types";
import type { AdminExportFilter } from "@/features/exports/exports.types";
import { AdminExportDialog } from "../_components/admin-export-dialog";
import { PaginationControls } from "../_components/pagination-controls";
import {
  AdminPanel,
  AdminSectionHeader,
  adminSelectClassName,
} from "../_components/admin-page";

type DraftFilters = {
  actionId: string;
  method: "all" | "reusable_code" | "claim_code";
  search: string;
  from: string;
  to: string;
};

const PAGE_SIZE = 20;
const emptyDraft: DraftFilters = {
  actionId: "",
  method: "all",
  search: "",
  from: "",
  to: "",
};

const methodLabels = {
  all: "Todos os métodos",
  reusable_code: "Código reutilizável",
  claim_code: "Código de uso único",
} as const;

const operationalDateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function CodeRedemptionHistory() {
  const [draft, setDraft] = useState<DraftFilters>(emptyDraft);
  const [appliedFilters, setAppliedFilters] =
    useState<CodeRedemptionsExportFilters>({});
  const [page, setPage] = useState(1);
  const [dateError, setDateError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const actions = useQuery({
    queryKey: ["admin", "actions", "code-redemption-filter"],
    queryFn: () => fetchAdminActions({ page: 1, limit: 100 }),
    retry: false,
  });
  const listFilters: AdminCodeRedemptionsFilters = {
    page,
    limit: PAGE_SIZE,
    ...appliedFilters,
  };
  const query = useQuery({
    queryKey: ["admin", "code-redemptions", listFilters],
    queryFn: () => fetchCodeRedemptions(listFilters),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const countExport = useCallback(
    () => fetchCodeRedemptionsExportCount(appliedFilters),
    [appliedFilters],
  );
  const downloadExport = useCallback(
    () => downloadCodeRedemptionsExport(appliedFilters),
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
    <section aria-labelledby="code-redemption-history-title" className="grid gap-5">
      <AdminSectionHeader
        action={
          <Button
            aria-label="Exportar resgates"
            onClick={() => setExportOpen(true)}
            variant="outline"
          >
            <Download aria-hidden="true" />
            Exportar resgates
          </Button>
        }
        description="Consulte todos os resgates feitos por código, com método, participante e horário operacional."
        eyebrow="rastreabilidade // resgates"
        id="code-redemption-history-title"
        title="Resgates por código"
      />
      <AdminPanel aria-labelledby="code-redemption-filters-title" className="overflow-hidden">
        <div className="border-b border-border/80 px-4 py-3 md:px-5">
          <h3
            className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-secondary"
            id="code-redemption-filters-title"
          >
            Filtros de resgates
          </h3>
        </div>
        <form className="grid gap-4 p-4 md:p-5" onSubmit={applyFilters}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="code-redemption-participant" label="Participante">
              <Input
                autoComplete="off"
                id="code-redemption-participant"
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
            <Field id="code-redemption-action" label="Atividade">
              <select
                className={adminSelectClassName}
                id="code-redemption-action"
                name="actionId"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    actionId: event.target.value,
                  }))
                }
                value={draft.actionId}
              >
                <option value="">Todas as atividades</option>
                {actions.data?.items.map((action) => (
                  <option key={action.id} value={action.id}>
                    {action.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="code-redemption-method" label="Método">
              <select
                className={adminSelectClassName}
                id="code-redemption-method"
                name="method"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    method: event.target.value as DraftFilters["method"],
                  }))
                }
                value={draft.method}
              >
                {Object.entries(methodLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="code-redemption-from" label="Data inicial">
                <Input
                  autoComplete="off"
                  id="code-redemption-from"
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
              <Field
                id="code-redemption-to"
                label="Data final exclusiva"
              >
                <Input
                  autoComplete="off"
                  id="code-redemption-to"
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
        <p role="status">Carregando resgates…</p>
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          isFetching={query.isFetching}
          retry={() => void query.refetch()}
        />
      ) : data && data.items.length > 0 ? (
        <div className="grid gap-4">
          <AdminPanel className="divide-y divide-border/80 overflow-hidden">
            {data.items.map((redemption) => (
              <RedemptionRow key={redemption.id} redemption={redemption} />
            ))}
          </AdminPanel>
          <PaginationControls
            onPageChange={setPage}
            page={data.meta.page}
            totalPages={data.meta.totalPages}
          />
        </div>
      ) : (
        <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
      )}

      {exportOpen ? (
        <AdminExportDialog
          appliedFilters={buildAppliedFilterLabels(appliedFilters, actions.data?.items)}
          count={countExport}
          download={downloadExport}
          onClose={() => setExportOpen(false)}
          title="Exportar resgates por código"
        />
      ) : null}
    </section>
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

function RedemptionRow({ redemption }: { redemption: AdminCodeRedemption }) {
  return (
    <article className="grid min-w-0 gap-4 px-4 py-5 transition-colors hover:bg-muted/25 md:grid-cols-[minmax(0,1fr)_auto] md:px-5">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 break-words text-lg font-semibold">
            {redemption.participant.name}
          </h3>
          <span className="rounded-full border border-secondary/35 bg-secondary/10 px-2 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-secondary">
            {getMethodLabel(redemption.method)}
          </span>
        </div>
        <p className="mt-1 break-words text-sm text-muted-foreground">
          {redemption.participant.email}
        </p>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Atividade: </span>
            <span className="font-semibold">
              {redemption.action?.name ?? "Atividade removida"}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">Código: </span>
            <code
              className="font-mono font-semibold tracking-[0.08em]"
              spellCheck={false}
              translate="no"
            >
              {redemption.code ?? "—"}
            </code>
          </p>
        </div>
      </div>
      <div className="grid content-start gap-2 text-left md:justify-items-end md:text-right">
        <div className="flex flex-wrap gap-2 md:justify-end">
          <span className="font-mono text-sm font-bold tabular-nums tracking-[0.04em]">
            {formatDelta(redemption.points, "PTS")}
          </span>
          <span className="font-mono text-sm font-bold tabular-nums tracking-[0.04em] text-muted-foreground">
            {formatDelta(redemption.xpDelta, "XP")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          <time dateTime={redemption.createdAt}>
            {operationalDateTime.format(new Date(redemption.createdAt))}
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
          Não foi possível carregar os resgates
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
        <h2 className="text-xl font-bold">Nenhum resgate por código encontrado.</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasFilters
            ? "Revise ou remova parte dos filtros aplicados."
            : "Ainda não há resgates feitos por código."}
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

function toAppliedFilters(draft: DraftFilters): CodeRedemptionsExportFilters {
  const filters: CodeRedemptionsExportFilters = {};
  const search = draft.search.trim();
  if (search) filters.search = search;
  if (draft.actionId) filters.actionId = draft.actionId;
  if (draft.method !== "all") filters.method = draft.method;
  if (draft.from) filters.from = draft.from;
  if (draft.to) filters.to = draft.to;
  return filters;
}

function isValidDateRange(from: string, to: string) {
  return (!from && !to) || Boolean(from && to && from < to);
}

function buildAppliedFilterLabels(
  filters: CodeRedemptionsExportFilters,
  actions: ReadonlyArray<{ id: string; name: string }> | undefined,
): readonly AdminExportFilter[] {
  return [
    { label: "Participante", value: filters.search ?? "Todos" },
    {
      label: "Atividade",
      value:
        actions?.find((action) => action.id === filters.actionId)?.name ??
        "Todas",
    },
    {
      label: "Método",
      value:
        filters.method === undefined
          ? methodLabels.all
          : methodLabels[filters.method],
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

function getMethodLabel(method: AdminCodeRedemption["method"]) {
  return method === "CLAIM_CODE"
    ? methodLabels.claim_code
    : methodLabels.reusable_code;
}

function formatDelta(value: number, unit: "PTS" | "XP") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} ${unit}`;
}
