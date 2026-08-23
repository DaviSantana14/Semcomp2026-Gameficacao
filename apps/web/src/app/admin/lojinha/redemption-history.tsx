"use client";

import { FormEvent, KeyboardEvent, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  downloadRedemptionsExport,
  fetchRedemptionsExportCount,
} from "@/features/exports/exports.service";
import {
  cancelRedemption,
  deliverRedemption,
  fetchAdminRedemptions,
} from "@/features/rewards/rewards.service";
import type {
  AdminRedemption,
  AdminReward,
} from "@/features/rewards/rewards.types";
import { ApiError } from "@/lib/http/api-error";
import { AdminExportDialog } from "../_components/admin-export-dialog";
import { PaginationControls } from "../_components/pagination-controls";
import { StatusBadge } from "../_components/status-badge";
import { AdminReasonDialog } from "../_components/admin-reason-dialog";
import {
  AdminPanel,
  AdminSectionHeader,
  adminSelectClassName,
} from "../_components/admin-page";

const tabs = ["all", "pending", "delivered", "cancelled"] as const;
const labels = {
  all: "Todos",
  pending: "Pendentes",
  delivered: "Entregues",
  cancelled: "Cancelados",
};
type Tab = (typeof tabs)[number];

type RedemptionHistoryProps = {
  rewards: AdminReward[];
  optionsLoading: boolean;
  optionsError: boolean;
  onRetryOptions: () => void;
};

export function RedemptionHistory({
  rewards,
  optionsLoading,
  optionsError,
  onRetryOptions,
}: RedemptionHistoryProps) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [rewardId, setRewardId] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [from, setFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [to, setTo] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [actionIntent, setActionIntent] = useState<{
    item: AdminRedemption;
    kind: "deliver" | "cancel";
  } | null>(null);
  const query = useQuery({
    queryKey: [
      "admin",
      "redemptions",
      { page, limit: 10, status, search, rewardId, from, to },
    ],
    queryFn: () =>
      fetchAdminRedemptions({
        page,
        limit: 10,
        status,
        search: search || undefined,
        rewardId: rewardId || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    retry: false,
  });
  const countExport = useCallback(
    () =>
      fetchRedemptionsExportCount({
        search: search || undefined,
        status,
        rewardId: rewardId || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    [from, rewardId, search, status, to],
  );
  const downloadExport = useCallback(
    () =>
      downloadRedemptionsExport({
        search: search || undefined,
        status,
        rewardId: rewardId || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    [from, rewardId, search, status, to],
  );
  const action = useMutation({
    mutationFn: async ({
      id,
      kind,
      reason,
    }: {
      id: string;
      kind: "deliver" | "cancel";
      reason: string;
    }) => {
      return kind === "deliver"
        ? deliverRedemption(id, { reason })
        : cancelRedemption(id, { reason });
    },
    onSuccess: async (_, variables) => {
      setActionIntent(null);
      toast.success(
        variables.kind === "deliver"
          ? "Pedido marcado como entregue."
          : "Pedido cancelado; pontos e estoque devolvidos.",
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "redemptions"] }),
        qc.invalidateQueries({ queryKey: ["admin", "rewards"] }),
        qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
        qc.invalidateQueries({ queryKey: ["rewards"] }),
      ]);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível atualizar o pedido.",
      ),
  });

  function selectTab(next: Tab) {
    setStatus(next);
    setPage(1);
    document.getElementById(`redemptions-${next}`)?.focus();
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const current = tabs.indexOf(status);
    let next: number | undefined;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      next = (current - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    selectTab(tabs[next]);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setSearch(draft.trim());
    setFrom(draftFrom);
    setTo(draftTo);
    setPage(1);
  }
  return (
    <AdminPanel aria-labelledby="redemptions-title" className="overflow-hidden">
      <AdminSectionHeader
        className="border-b border-border/80 px-5 py-5 md:px-6"
        description="Acompanhe a fila e conclua cada retirada presencial."
        eyebrow="atendimento // pedidos"
        id="redemptions-title"
        title="Retiradas"
      />
      <div className="grid gap-5 p-5 md:p-6">
        <div
          aria-label="Status do pedido"
          className="flex gap-1 overflow-x-auto rounded-[13px] bg-background/35 p-1.5"
          role="tablist"
        >
          {tabs.map((tab) => (
            <Button
              aria-controls="redemptions-panel"
              aria-selected={status === tab}
              id={`redemptions-${tab}`}
              key={tab}
              onClick={() => selectTab(tab)}
              onKeyDown={keyDown}
              role="tab"
              tabIndex={status === tab ? 0 : -1}
              variant={status === tab ? "secondary" : "ghost"}
            >
              {labels[tab]}
            </Button>
          ))}
        </div>
        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] lg:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)_12rem_12rem_auto]"
          onSubmit={submit}
        >
          <Input
            aria-label="Buscar participante"
            placeholder="Nome ou e-mail do participante"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <select
            aria-describedby={optionsError ? "reward-options-error" : undefined}
            aria-label="Filtrar por recompensa"
            className={adminSelectClassName}
            disabled={optionsLoading || optionsError}
            value={rewardId}
            onChange={(e) => {
              setRewardId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">
              {optionsLoading
                ? "Carregando recompensas..."
                : optionsError
                  ? "Recompensas indisponíveis"
                  : "Todas as recompensas"}
            </option>
            {rewards.map((reward) => (
              <option key={reward.id} value={reward.id}>
                {reward.name}
              </option>
            ))}
          </select>
          <Input
            aria-label="Data inicial"
            onChange={(event) => setDraftFrom(event.target.value)}
            type="date"
            value={draftFrom}
          />
          <Input
            aria-label="Data final"
            onChange={(event) => setDraftTo(event.target.value)}
            type="date"
            value={draftTo}
          />
          <Button type="submit" variant="outline">
            <Search />
            Buscar
          </Button>
        </form>
        <div className="flex flex-wrap justify-end">
          <Button
            aria-label="Exportar pedidos"
            onClick={() => setExportOpen(true)}
            variant="outline"
          >
            <Download aria-hidden="true" />
            Exportar pedidos
          </Button>
        </div>
        {optionsError ? (
          <div
            className="rounded-lg border border-destructive/40 p-4"
            id="reward-options-error"
            role="alert"
          >
            <p>Não foi possível carregar a lista completa de recompensas.</p>
            <Button
              className="mt-3"
              onClick={onRetryOptions}
              type="button"
              variant="outline"
            >
              <RefreshCw />
              Tentar novamente
            </Button>
          </div>
        ) : null}
        <div
          aria-labelledby={`redemptions-${status}`}
          className="grid gap-3"
          id="redemptions-panel"
          role="tabpanel"
        >
          {query.isPending ? (
            <div
              className="flex items-center gap-2 rounded-[13px] border border-border/70 bg-background/35 p-4"
              role="status"
            >
              <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              Carregando pedidos...
            </div>
          ) : query.error ? (
            <div
              className="rounded-[16px] border border-destructive/40 bg-destructive/5 p-5"
              role="alert"
            >
              <p>Não foi possível carregar os pedidos.</p>
              <Button
                className="mt-3"
                onClick={() => void query.refetch()}
                variant="outline"
              >
                <RefreshCw />
                Tentar novamente
              </Button>
            </div>
          ) : query.data?.items.length ? (
            <div className="divide-y divide-border/80 border-y border-border/80">
              {query.data.items.map((item) => {
                const pending =
                  action.isPending && action.variables?.id === item.id;
                return (
                  <article
                    className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                    key={item.id}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{item.reward.name}</h3>
                        <StatusBadge
                          label={
                            item.status === "PENDING"
                              ? "Pendente"
                              : item.status === "DELIVERED"
                                ? "Entregue"
                                : "Cancelado"
                          }
                          status={
                            item.status === "PENDING"
                              ? "pending"
                              : item.status === "DELIVERED"
                                ? "active"
                                : "inactive"
                          }
                        />
                      </div>
                      <p className="mt-1 text-sm">
                        {item.user.name} · {item.user.email}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Solicitado em {formatDate(item.createdAt)} · atualizado
                        em {formatDate(item.updatedAt)}
                      </p>
                      <Badge className="mt-2 font-mono">
                        {item.pointsSpent} PTS gastos
                      </Badge>
                    </div>
                    {item.status === "PENDING" ? (
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Button
                          disabled={pending}
                          onClick={() =>
                            setActionIntent({ item, kind: "deliver" })
                          }
                        >
                          <Check />
                          {pending && action.variables?.kind === "deliver"
                            ? "Entregando..."
                            : "Marcar entregue"}
                        </Button>
                        <Button
                          className="border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                          disabled={pending}
                          onClick={() =>
                            setActionIntent({ item, kind: "cancel" })
                          }
                          variant="outline"
                        >
                          {pending && action.variables?.kind === "cancel" ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <X />
                          )}
                          {pending && action.variables?.kind === "cancel"
                            ? "Cancelando..."
                            : "Cancelar pedido"}
                        </Button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              <PaginationControls
                page={query.data.meta.page}
                totalPages={query.data.meta.totalPages}
                onPageChange={setPage}
              />
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-border p-6">
              <RotateCcw className="text-primary" />
              <h3 className="mt-3 font-semibold">Nenhum pedido encontrado</h3>
              <p className="text-sm text-muted-foreground">
                Revise os filtros ou aguarde novos resgates.
              </p>
            </div>
          )}
        </div>
      </div>
      {exportOpen ? (
        <AdminExportDialog
          appliedFilters={[
            {
              label: "Busca",
              value: search || "Todos os participantes",
            },
            { label: "Status", value: labels[status] },
            {
              label: "Recompensa",
              value:
                rewards.find((reward) => reward.id === rewardId)?.name ??
                "Todas as recompensas",
            },
            {
              label: "Período",
              value:
                from || to
                  ? `${from || "início"} a ${to || "fim"}`
                  : "Todo o período",
            },
          ]}
          count={countExport}
          download={downloadExport}
          onClose={() => setExportOpen(false)}
          title="Exportar pedidos da lojinha"
        />
      ) : null}
      {actionIntent ? (
        <AdminReasonDialog
          confirmLabel={
            actionIntent.kind === "deliver"
              ? "Confirmar entrega"
              : "Confirmar cancelamento"
          }
          currentState="Pendente"
          description={`${actionIntent.item.reward.name} · ${actionIntent.item.user.name}`}
          intendedState={
            actionIntent.kind === "deliver"
              ? "Entregue"
              : "Cancelado com devolução"
          }
          onClose={() => setActionIntent(null)}
          onSubmit={(reason) =>
            action.mutateAsync({
              id: actionIntent.item.id,
              kind: actionIntent.kind,
              reason,
            })
          }
          operationKey={`${actionIntent.item.id}:${actionIntent.kind}`}
          title={
            actionIntent.kind === "deliver"
              ? "Entregar pedido"
              : "Cancelar pedido"
          }
        />
      ) : null}
    </AdminPanel>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
