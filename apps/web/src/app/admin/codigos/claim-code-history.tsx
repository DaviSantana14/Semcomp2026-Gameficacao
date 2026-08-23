"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchAdminActions,
  fetchAdminClaimCodes,
  updateClaimCodeStatus,
} from "@/features/actions/actions.service";
import type {
  AdminClaimCode,
  ClaimCodeBulkOperationDetail,
} from "@/features/actions/actions.types";
import { ApiError } from "@/lib/http/api-error";
import { PaginationControls } from "../_components/pagination-controls";
import { StatusBadge } from "../_components/status-badge";
import { AdminReasonDialog } from "../_components/admin-reason-dialog";
import {
  ClaimCodeBulkDialog,
  MAX_CLAIM_CODE_BULK_SELECTION,
} from "./claim-code-bulk-dialog";
import { ClaimCodeBulkReport } from "./claim-code-bulk-report";
import {
  AdminPanel,
  AdminSectionHeader,
  adminSelectClassName,
} from "../_components/admin-page";
const status = {
  AVAILABLE: ["Disponível", "active"],
  DISABLED: ["Desativado", "inactive"],
  BLOCKED_BY_ACTION: ["Atividade bloqueada", "pending"],
  USED: ["Utilizado", "inactive"],
} as const;

function isBulkSelectable(code: AdminClaimCode) {
  return !code.isUsed && code.status !== "USED";
}

export function addClaimCodeSelection(
  selectedIds: ReadonlySet<string>,
  candidateIds: readonly string[],
  max = MAX_CLAIM_CODE_BULK_SELECTION,
) {
  const selection = new Set(selectedIds);
  let truncated = false;
  for (const id of candidateIds) {
    if (selection.has(id)) continue;
    if (selection.size >= max) {
      truncated = true;
      break;
    }
    selection.add(id);
  }
  return { selection, truncated };
}

export function ClaimCodeHistory() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionId, setActionId] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "available" | "disabled" | "blocked" | "used"
  >("all");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [toggleIntent, setToggleIntent] = useState<AdminClaimCode | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkIntent, setBulkIntent] = useState<
    "activate" | "deactivate" | null
  >(null);
  const [bulkReportId, setBulkReportId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const actions = useQuery({
    queryKey: ["admin", "actions", "claim-filter"],
    queryFn: () => fetchAdminActions({ page: 1, limit: 100 }),
    retry: false,
  });
  const query = useQuery({
    queryKey: [
      "admin",
      "claim-codes",
      { page, limit: 10, search, actionId, status: statusFilter },
    ],
    queryFn: () =>
      fetchAdminClaimCodes({
        page,
        limit: 10,
        search: search || undefined,
        actionId: actionId || undefined,
        status: statusFilter,
      }),
    retry: false,
  });
  const toggle = useMutation({
    mutationFn: async ({
      c,
      reason,
    }: {
      c: AdminClaimCode;
      reason: string;
    }) => {
      return updateClaimCodeStatus(c.id, { isActive: !c.isActive, reason });
    },
    onMutate: ({ c }) => setPendingIds((ids) => new Set(ids).add(c.id)),
    onSuccess: async () => {
      setToggleIntent(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "claim-codes"] }),
        qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
      ]);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Não foi possível atualizar.",
      ),
    onSettled: (_, __, { c }) =>
      setPendingIds((ids) => {
        const next = new Set(ids);
        next.delete(c.id);
        return next;
      }),
  });
  const pageSelectableIds =
    query.data?.items.filter(isBulkSelectable).map((code) => code.id) ?? [];
  const pageIsSelected =
    pageSelectableIds.length > 0 &&
    pageSelectableIds.every((id) => selectedIds.has(id));

  function toggleSelected(id: string) {
    if (
      !selectedIds.has(id) &&
      selectedIds.size >= MAX_CLAIM_CODE_BULK_SELECTION
    ) {
      setSelectionError(
        `É possível selecionar no máximo ${MAX_CLAIM_CODE_BULK_SELECTION} códigos.`,
      );
      return;
    }
    setSelectionError(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePageSelection() {
    if (!pageSelectableIds.length) return;
    setSelectionError(null);
    if (pageIsSelected) {
      setSelectedIds((current) => {
        const next = new Set(current);
        pageSelectableIds.forEach((id) => next.delete(id));
        return next;
      });
      return;
    }

    const { selection, truncated } = addClaimCodeSelection(
      selectedIds,
      pageSelectableIds,
    );
    if (truncated) {
      setSelectionError(
        `A seleção foi limitada a ${MAX_CLAIM_CODE_BULK_SELECTION} códigos.`,
      );
    }
    setSelectedIds(selection);
  }

  async function handleBulkSuccess(operation: ClaimCodeBulkOperationDetail) {
    setSelectedIds(new Set());
    setBulkIntent(null);
    setBulkReportId(operation.id);
    toast.success("Operação em lote registrada.");
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "claim-codes"] }),
      qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
      qc.invalidateQueries({
        queryKey: ["admin", "claim-code-bulk-operations"],
      }),
    ]);
  }

  return (
    <section aria-labelledby="single-code-history-title" className="grid gap-5">
      <AdminSectionHeader
        description="Localize códigos individuais por atividade, estado ou valor."
        eyebrow="inventário // uso único"
        id="single-code-history-title"
        title="Histórico de uso único"
      />
      <AdminPanel className="grid gap-3 p-4 sm:grid-cols-3 md:p-5">
        <Input
          aria-label="Buscar código"
          placeholder="Buscar código"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value.toUpperCase());
            setPage(1);
          }}
        />
        <select
          aria-label="Filtrar por atividade"
          className={adminSelectClassName}
          value={actionId}
          onChange={(e) => {
            setActionId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas as atividades</option>
          {actions.data?.items.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por status"
          className={adminSelectClassName}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
        >
          <option value="all">Todos os status</option>
          <option value="available">Disponíveis</option>
          <option value="disabled">Desativados</option>
          <option value="blocked">Atividade bloqueada</option>
          <option value="used">Utilizados</option>
        </select>
      </AdminPanel>
      {query.data?.items.length ? (
        <AdminPanel className="grid gap-3 p-4 md:flex md:items-center md:justify-between md:p-5">
          <div className="grid gap-1">
            <label className="inline-flex min-h-11 items-center gap-3 text-sm font-semibold">
              <input
                aria-label="Selecionar todos os códigos disponíveis desta página"
                checked={pageIsSelected}
                className="size-5 accent-primary"
                disabled={!pageSelectableIds.length}
                onChange={togglePageSelection}
                type="checkbox"
              />
              Selecionar página
            </label>
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {selectedIds.size} {selectedIds.size === 1 ? "código" : "códigos"}{" "}
              selecionado
              {selectedIds.size === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!selectedIds.size}
              onClick={() => setBulkIntent("activate")}
              variant="outline"
            >
              Ativar selecionados
            </Button>
            <Button
              disabled={!selectedIds.size}
              onClick={() => setBulkIntent("deactivate")}
              variant="outline"
            >
              Desativar selecionados
            </Button>
          </div>
          {selectionError ? (
            <p className="text-sm text-destructive md:col-span-2" role="alert">
              {selectionError}
            </p>
          ) : null}
        </AdminPanel>
      ) : null}
      {query.isPending ? (
        <p role="status">Carregando códigos...</p>
      ) : query.error ? (
        <Button className="w-fit" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      ) : query.data?.items.length ? (
        <div className="grid gap-4">
          <AdminPanel className="divide-y divide-border/80 overflow-hidden">
            {query.data.items.map((c) => (
              <article
                className="grid gap-4 px-4 py-5 transition-colors hover:bg-muted/25 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-5"
                key={c.id}
              >
                <div className="flex gap-3">
                  {isBulkSelectable(c) ? (
                    <input
                      aria-label={`Selecionar código ${c.code}`}
                      checked={selectedIds.has(c.id)}
                      className="mt-1 size-5 shrink-0 accent-primary"
                      onChange={() => toggleSelected(c.id)}
                      type="checkbox"
                    />
                  ) : null}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-base font-bold tracking-[0.08em] text-foreground">
                        {c.code}
                      </code>
                      <StatusBadge
                        label={status[c.status][0]}
                        status={status[c.status][1]}
                      />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {c.action.name} ·{" "}
                      {c.usedBy
                        ? `Usado por ${c.usedBy.name} (${c.usedBy.email}) em ${new Date(c.usedAt!).toLocaleString("pt-BR")}`
                        : `Criado em ${new Date(c.createdAt).toLocaleString("pt-BR")}`}
                    </p>
                  </div>
                </div>
                {c.status !== "USED" ? (
                  <Button
                    disabled={pendingIds.has(c.id)}
                    variant="outline"
                    onClick={() => setToggleIntent(c)}
                  >
                    {pendingIds.has(c.id)
                      ? "Atualizando..."
                      : c.isActive
                        ? "Desativar"
                        : "Ativar"}
                  </Button>
                ) : null}
              </article>
            ))}
          </AdminPanel>
          <PaginationControls
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            onPageChange={setPage}
          />
        </div>
      ) : (
        <p className="rounded-[18px] border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
          Nenhum código encontrado. Ajuste os filtros ou gere um lote.
        </p>
      )}
      {bulkIntent ? (
        <ClaimCodeBulkDialog
          intent={bulkIntent}
          onClose={() => setBulkIntent(null)}
          onSuccess={(operation) => void handleBulkSuccess(operation)}
          selectedIds={selectedIds}
        />
      ) : null}
      {bulkReportId ? (
        <ClaimCodeBulkReport
          onClose={() => setBulkReportId(null)}
          operationId={bulkReportId}
        />
      ) : null}
      {toggleIntent ? (
        <AdminReasonDialog
          confirmLabel="Confirmar alteração"
          currentState={toggleIntent.isActive ? "Disponível" : "Desativado"}
          description={`Código ${toggleIntent.code} · ${toggleIntent.action.name}`}
          intendedState={toggleIntent.isActive ? "Desativado" : "Disponível"}
          onClose={() => setToggleIntent(null)}
          onSubmit={(reason) => toggle.mutateAsync({ c: toggleIntent, reason })}
          operationKey={`${toggleIntent.id}:${String(!toggleIntent.isActive)}`}
          title="Alterar status do código"
        />
      ) : null}
    </section>
  );
}
