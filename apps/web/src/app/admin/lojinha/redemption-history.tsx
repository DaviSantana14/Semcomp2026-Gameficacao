"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  cancelRedemption,
  deliverRedemption,
  fetchAdminRedemptions,
} from "@/features/rewards/rewards.service";
import type { AdminReward } from "@/features/rewards/rewards.types";
import { ApiError } from "@/lib/http/api-error";
import { PaginationControls } from "../_components/pagination-controls";
import { StatusBadge } from "../_components/status-badge";

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
  const query = useQuery({
    queryKey: [
      "admin",
      "redemptions",
      { page, limit: 10, status, search, rewardId },
    ],
    queryFn: () =>
      fetchAdminRedemptions({
        page,
        limit: 10,
        status,
        search: search || undefined,
        rewardId: rewardId || undefined,
      }),
    retry: false,
  });
  const action = useMutation({
    mutationFn: async ({
      id,
      kind,
    }: {
      id: string;
      kind: "deliver" | "cancel";
    }) => {
      return kind === "deliver" ? deliverRedemption(id) : cancelRedemption(id);
    },
    onSuccess: async (_, variables) => {
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
    setPage(1);
  }
  function mutate(id: string, kind: "deliver" | "cancel") {
    const message =
      kind === "deliver"
        ? "Confirmar que este pedido foi entregue ao participante?"
        : "Cancelar este pedido? Os pontos e uma unidade de estoque serão devolvidos. O XP não será alterado.";
    if (window.confirm(message)) action.mutate({ id, kind });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de pedidos</CardTitle>
        <CardDescription>
          Acompanhe a fila e conclua cada retirada presencial.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div
          aria-label="Status do pedido"
          className="flex gap-2 overflow-x-auto pb-1"
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
              variant={status === tab ? "primary" : "outline"}
            >
              {labels[tab]}
            </Button>
          ))}
        </div>
        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)_auto]"
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
            className="min-h-11 rounded-md border border-input bg-muted px-3"
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
          <Button variant="outline">
            <Search />
            Buscar
          </Button>
        </form>
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
            <div className="flex items-center gap-2" role="status">
              <LoaderCircle className="animate-spin" />
              Carregando pedidos...
            </div>
          ) : query.error ? (
            <div
              className="rounded-lg border border-destructive/40 p-5"
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
            <div className="grid gap-3">
              {query.data.items.map((item) => {
                const pending =
                  action.isPending && action.variables?.id === item.id;
                return (
                  <article
                    className="grid gap-3 rounded-lg border bg-muted/30 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
                    key={item.id}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black">{item.reward.name}</h3>
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
                      <Badge className="mt-2">
                        {item.pointsSpent} PTS gastos
                      </Badge>
                    </div>
                    {item.status === "PENDING" ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={pending}
                          onClick={() => mutate(item.id, "deliver")}
                        >
                          <Check />
                          {pending && action.variables?.kind === "deliver"
                            ? "Entregando..."
                            : "Marcar entregue"}
                        </Button>
                        <Button
                          disabled={pending}
                          onClick={() => mutate(item.id, "cancel")}
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
            <div className="rounded-lg border border-dashed p-6">
              <RotateCcw />
              <h3 className="mt-2 font-black">Nenhum pedido encontrado</h3>
              <p className="text-sm text-muted-foreground">
                Revise os filtros ou aguarde novos resgates.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
