"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Filter, ListRestart, SearchX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  auditQueryKey,
  isValidAuditDateRange,
  parseAuditUrlFilters,
  updateAuditUrlFilters,
} from "@/features/audit/audit-filters";
import { fetchAdminAuditEvents } from "@/features/audit/audit.service";
import {
  AUDIT_ACTOR_TYPES,
  AUDIT_ENTITY_TYPES,
  AUDIT_OPERATIONS,
  type AuditFilterPatch,
} from "@/features/audit/audit.types";
import { ApiError } from "@/lib/http/api-error";
import { PaginationControls } from "../_components/pagination-controls";
import { AuditEventList } from "./audit-event-list";
import { actorLabels, entityLabels, operationLabels } from "./audit-labels";

type DraftFilters = {
  actorType: string;
  actorAdminId: string;
  operation: string;
  entityType: string;
  entityId: string;
  participantId: string;
  requestId: string;
  from: string;
  to: string;
};

export function AuditClient() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const filters = useMemo(
    () => parseAuditUrlFilters(new URLSearchParams(search)),
    [search],
  );
  const [draft, setDraft] = useState<DraftFilters>(() => toDraft(filters));
  const [dateError, setDateError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stateSearch, setStateSearch] = useState(search);

  if (stateSearch !== search) {
    setStateSearch(search);
    setDraft(toDraft(filters));
    setDateError(null);
    setSelectedId(null);
  }

  const auditQuery = useQuery({
    queryKey: auditQueryKey(filters),
    queryFn: () => fetchAdminAuditEvents(filters),
    placeholderData: keepPreviousData,
    retry: false,
  });

  function navigate(patch: AuditFilterPatch) {
    const next = updateAuditUrlFilters(new URLSearchParams(search), patch);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
      scroll: false,
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidAuditDateRange(draft.from, draft.to)) {
      setDateError("A data inicial deve ser anterior ou igual à data final.");
      return;
    }
    setDateError(null);
    navigate(draft);
  }

  function clearFilters() {
    setDraft(emptyDraft);
    setDateError(null);
    router.replace(pathname, { scroll: false });
  }

  const data = auditQuery.data;
  const hasFilters = Object.keys(filters).some(
    (key) => key !== "page" && key !== "limit",
  );

  return (
    <div className="mx-auto grid w-full max-w-[96rem] gap-5">
      <header className="grid gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
          Operação // rastreabilidade
        </p>
        <h1 className="text-3xl font-black tracking-tight md:text-5xl">
          Auditoria
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Investigue alterações administrativas por ator, entidade, participante
          e requisição.
        </p>
      </header>

      <Card className="bg-card/90">
        <CardContent className="p-4 md:p-5">
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                id="audit-actor-type"
                label="Tipo de ator"
                onChange={(value) => setField(setDraft, "actorType", value)}
                value={draft.actorType}
              >
                <option value="">Todos</option>
                {AUDIT_ACTOR_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {actorLabels[value]}
                  </option>
                ))}
              </SelectField>
              <TextField
                id="audit-actor-id"
                label="ID do administrador"
                onChange={(value) => setField(setDraft, "actorAdminId", value)}
                placeholder="admin_..."
                value={draft.actorAdminId}
              />
              <SelectField
                id="audit-operation"
                label="Operação"
                onChange={(value) => setField(setDraft, "operation", value)}
                value={draft.operation}
              >
                <option value="">Todas</option>
                {AUDIT_OPERATIONS.map((value) => (
                  <option key={value} value={value}>
                    {operationLabels[value]}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="audit-entity-type"
                label="Tipo de entidade"
                onChange={(value) => setField(setDraft, "entityType", value)}
                value={draft.entityType}
              >
                <option value="">Todas</option>
                {AUDIT_ENTITY_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {entityLabels[value]}
                  </option>
                ))}
              </SelectField>
              <TextField
                id="audit-entity-id"
                label="ID da entidade"
                onChange={(value) => setField(setDraft, "entityId", value)}
                placeholder="Identificador principal"
                value={draft.entityId}
              />
              <TextField
                id="audit-participant-id"
                label="ID do participante"
                onChange={(value) => setField(setDraft, "participantId", value)}
                placeholder="participant_..."
                value={draft.participantId}
              />
              <TextField
                id="audit-request-id"
                label="Request ID"
                onChange={(value) => setField(setDraft, "requestId", value)}
                placeholder="request_..."
                value={draft.requestId}
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  id="audit-from"
                  label="Data inicial"
                  onChange={(value) => setField(setDraft, "from", value)}
                  type="date"
                  value={draft.from}
                />
                <TextField
                  id="audit-to"
                  label="Data final"
                  onChange={(value) => setField(setDraft, "to", value)}
                  type="date"
                  value={draft.to}
                />
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
        </CardContent>
      </Card>

      {auditQuery.isPending ? (
        <AuditSkeleton />
      ) : auditQuery.isError ? (
        <ErrorState
          error={auditQuery.error}
          isFetching={auditQuery.isFetching}
          retry={() => void auditQuery.refetch()}
        />
      ) : data && data.items.length > 0 ? (
        <section aria-labelledby="audit-result-title" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black" id="audit-result-title">
                Eventos encontrados
              </h2>
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {data.meta.total.toLocaleString("pt-BR")} evento
                {data.meta.total === 1 ? "" : "s"}
              </p>
            </div>
            {auditQuery.isFetching ? (
              <p
                className="font-mono text-xs uppercase text-primary"
                role="status"
              >
                Atualizando resultados...
              </p>
            ) : null}
          </div>
          <AuditEventList
            events={data.items}
            onSelect={setSelectedId}
            selectedId={selectedId}
          />
          <PaginationControls
            onPageChange={(page) => navigate({ page })}
            page={data.meta.page}
            totalPages={data.meta.totalPages}
          />
        </section>
      ) : (
        <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
      )}
    </div>
  );
}

function TextField({
  id,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        autoComplete="off"
        id={id}
        maxLength={type === "text" ? 100 : undefined}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </div>
  );
}

function SelectField({
  children,
  id,
  label,
  onChange,
  value,
}: {
  children: React.ReactNode;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        className="min-h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </div>
  );
}

function setField(
  setDraft: React.Dispatch<React.SetStateAction<DraftFilters>>,
  key: keyof DraftFilters,
  value: string,
) {
  setDraft((current) => ({ ...current, [key]: value }));
}

function toDraft(
  filters: ReturnType<typeof parseAuditUrlFilters>,
): DraftFilters {
  return {
    actorType: filters.actorType ?? "",
    actorAdminId: filters.actorAdminId ?? "",
    operation: filters.operation ?? "",
    entityType: filters.entityType ?? "",
    entityId: filters.entityId ?? "",
    participantId: filters.participantId ?? "",
    requestId: filters.requestId ?? "",
    from: filters.from ?? "",
    to: filters.to ?? "",
  };
}

const emptyDraft: DraftFilters = {
  actorType: "",
  actorAdminId: "",
  operation: "",
  entityType: "",
  entityId: "",
  participantId: "",
  requestId: "",
  from: "",
  to: "",
};

function AuditSkeleton() {
  return (
    <div aria-label="Carregando auditoria" className="grid gap-3" role="status">
      <Skeleton className="h-10" />
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton className="h-20" key={index} />
      ))}
    </div>
  );
}

function ErrorState({
  error,
  isFetching,
  retry,
}: {
  error: Error;
  isFetching: boolean;
  retry: () => void;
}) {
  return (
    <div
      className="grid justify-items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-5"
      role="alert"
    >
      <div>
        <h2 className="text-xl font-black">
          Não foi possível carregar a auditoria
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof ApiError
            ? error.message
            : "Verifique sua conexão e tente novamente."}
        </p>
      </div>
      <Button disabled={isFetching} onClick={retry}>
        {isFetching ? "Consultando..." : "Tentar novamente"}
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
    <div className="grid justify-items-start gap-3 rounded-md border border-dashed border-border bg-card/70 p-6">
      <SearchX aria-hidden="true" className="size-8 text-primary" />
      <div>
        <h2 className="text-xl font-black">Nenhum evento encontrado</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasFilters
            ? "Revise ou remova parte dos filtros da investigação."
            : "Ainda não há eventos administrativos registrados."}
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
