"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminClaimCode,
  ApiError,
  fetchAdminActions,
  fetchAdminClaimCodes,
  fetchCsrfToken,
  getCsrfToken,
  updateClaimCodeStatus,
} from "@/lib/api";
import { PaginationControls } from "../_components/pagination-controls";
import { StatusBadge } from "../_components/status-badge";
const status = {
  AVAILABLE: ["Disponível", "active"],
  DISABLED: ["Desativado", "inactive"],
  BLOCKED_BY_ACTION: ["Atividade bloqueada", "pending"],
  USED: ["Utilizado", "inactive"],
} as const;
export function ClaimCodeHistory() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionId, setActionId] = useState("");
  const actions = useQuery({
    queryKey: ["admin", "actions", "claim-filter"],
    queryFn: () => fetchAdminActions({ page: 1, limit: 100 }),
    retry: false,
  });
  const query = useQuery({
    queryKey: ["admin", "claim-codes", { page, limit: 10, search, actionId }],
    queryFn: () =>
      fetchAdminClaimCodes({
        page,
        limit: 10,
        search: search || undefined,
        actionId: actionId || undefined,
      }),
    retry: false,
  });
  const toggle = useMutation({
    mutationFn: async (c: AdminClaimCode) => {
      if (!getCsrfToken()) await fetchCsrfToken();
      return updateClaimCodeStatus(c.id, !c.isActive);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "claim-codes"] }),
        qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
      ]);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Não foi possível atualizar.",
      ),
  });
  return (
    <section className="grid gap-4">
      <h2 className="text-2xl font-black">Histórico de uso único</h2>
      <div className="grid gap-2 sm:grid-cols-2">
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
          className="min-h-11 rounded-md border border-input bg-muted px-3"
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
      </div>
      {query.isPending ? (
        <p role="status">Carregando códigos...</p>
      ) : query.error ? (
        <Button className="w-fit" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      ) : query.data?.items.length ? (
        <div className="grid gap-3">
          {query.data.items.map((c) => (
            <article
              className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_auto]"
              key={c.id}
            >
              <div>
                <div className="flex flex-wrap gap-2">
                  <code className="font-bold">{c.code}</code>
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
              {c.status !== "USED" ? (
                <Button
                  disabled={toggle.isPending}
                  variant="outline"
                  onClick={() => toggle.mutate(c)}
                >
                  {c.isActive ? "Desativar" : "Ativar"}
                </Button>
              ) : null}
            </article>
          ))}
          <PaginationControls
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            onPageChange={setPage}
          />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-6">
          Nenhum código encontrado. Ajuste os filtros ou gere um lote.
        </p>
      )}
    </section>
  );
}
