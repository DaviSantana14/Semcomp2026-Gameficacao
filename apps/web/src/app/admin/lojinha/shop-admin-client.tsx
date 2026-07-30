"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ImageOff,
  LoaderCircle,
  PackageSearch,
  Pencil,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createReward,
  fetchAdminRewards,
  updateReward,
} from "@/features/rewards/rewards.service";
import type {
  AdminReward,
  AdminRewardsFilters,
} from "@/features/rewards/rewards.types";
import { ApiError } from "@/lib/http/api-error";
import { PaginationControls } from "../_components/pagination-controls";
import { StatusBadge } from "../_components/status-badge";
import { RedemptionHistory } from "./redemption-history";
import { RewardForm, RewardFormSubmission } from "./reward-form";
import {
  finalizeRewardOptions,
  validateRewardOptionsPage,
} from "./reward-options-pagination";
import { AdminReasonDialog } from "../_components/admin-reason-dialog";
import {
  AdminPageHeader,
  AdminPanel,
  AdminSectionHeader,
} from "../_components/admin-page";

const statuses: Array<{
  value: NonNullable<AdminRewardsFilters["status"]>;
  label: string;
}> = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "out_of_stock", label: "Esgotados" },
];

export function ShopAdminClient() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] =
    useState<NonNullable<AdminRewardsFilters["status"]>>("all");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminReward | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [toggleIntent, setToggleIntent] = useState<AdminReward | null>(null);
  const query = useQuery({
    queryKey: ["admin", "rewards", { page, limit: 10, status, search }],
    queryFn: ({ signal }) =>
      fetchAdminRewards(
        { page, limit: 10, status, search: search || undefined },
        signal,
      ),
    retry: false,
  });
  const rewardOptions = useQuery({
    queryKey: ["admin", "reward-options"],
    queryFn: ({ signal }) => fetchAllRewardOptions(signal),
    retry: false,
  });
  const save = useMutation({
    mutationFn: async (submission: RewardFormSubmission) => {
      return submission.mode === "edit"
        ? updateReward(submission.rewardId, submission.payload)
        : createReward(submission.payload);
    },
    onSuccess: async () => {
      toast.success(editing ? "Recompensa atualizada." : "Recompensa criada.");
      setEditing(null);
      setFormVersion((value) => value + 1);
      await invalidateShop(qc);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível salvar a recompensa.",
      ),
  });
  const toggle = useMutation({
    mutationFn: async ({
      reward,
      reason,
    }: {
      reward: AdminReward;
      reason: string;
    }) => {
      return updateReward(reward.id, { isActive: !reward.isActive, reason });
    },
    onSuccess: async (_, { reward }) => {
      setToggleIntent(null);
      toast.success(
        reward.isActive ? "Recompensa desativada." : "Recompensa ativada.",
      );
      await invalidateShop(qc);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível alterar o status.",
      ),
  });
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(draft.trim());
    setPage(1);
  }
  function changeStatus(next: NonNullable<AdminRewardsFilters["status"]>) {
    setStatus(next);
    setPage(1);
  }
  function toggleReward(reward: AdminReward) {
    if (save.isPending) return;
    setToggleIntent(reward);
  }

  function editReward(reward: AdminReward) {
    if (save.isPending) return;
    setEditing(reward);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-8">
      <AdminPageHeader
        description={
          <p>
            Gerencie o catálogo sem interromper a fila de pedidos já
            confirmados.
          </p>
        }
        eyebrow="operação // lojinha"
        title="Estoque & retiradas"
      />
      <RewardForm
        key={editing?.id ?? `new-${formVersion}`}
        reward={editing}
        pending={save.isPending}
        onCancel={() => {
          if (!save.isPending) setEditing(null);
        }}
        onSubmit={(payload) => save.mutate(payload)}
      />
      <section aria-labelledby="catalog-title" className="grid gap-5">
        <AdminSectionHeader
          description="Itens inativos e esgotados continuam visíveis para operação."
          eyebrow="estoque // catálogo"
          id="catalog-title"
          title="Catálogo"
        />
        <AdminPanel className="grid gap-4 p-4 md:p-5">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={submitSearch}
          >
            <Input
              aria-label="Buscar recompensa"
              placeholder="Buscar por nome ou descrição"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button variant="outline">
              <Search />
              Buscar
            </Button>
          </form>
          <div
            aria-label="Filtrar catálogo por status"
            className="flex gap-1 overflow-x-auto rounded-[13px] bg-background/35 p-1.5"
          >
            {statuses.map((item) => (
              <Button
                aria-pressed={status === item.value}
                key={item.value}
                onClick={() => changeStatus(item.value)}
                variant={status === item.value ? "secondary" : "ghost"}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </AdminPanel>
        {query.isPending ? (
          <div
            className="flex items-center gap-2 rounded-[18px] border border-border/80 bg-card/60 p-5"
            role="status"
          >
            <LoaderCircle className="animate-spin motion-reduce:animate-none" />
            Carregando catálogo...
          </div>
        ) : query.error ? (
          <div
            className="rounded-[18px] border border-destructive/40 bg-destructive/5 p-5"
            role="alert"
          >
            <p>Não foi possível carregar o catálogo.</p>
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
          <div className="grid gap-4 md:grid-cols-2">
            {query.data.items.map((reward) => {
              const toggling =
                toggle.isPending && toggle.variables?.reward.id === reward.id;
              return (
                <article
                  className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 rounded-[18px] border border-border/80 bg-card/75 p-4 transition-colors hover:border-secondary/35"
                  key={reward.id}
                >
                  <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-muted">
                    {reward.imageUrl ? (
                      <Image
                        alt={`Imagem de ${reward.name}`}
                        className="object-cover"
                        fill
                        sizes="80px"
                        src={reward.imageUrl}
                        unoptimized
                      />
                    ) : (
                      <ImageOff
                        aria-label="Sem imagem"
                        className="text-muted-foreground"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{reward.name}</h3>
                      <StatusBadge
                        label={
                          !reward.isActive
                            ? "Inativa"
                            : reward.stock === 0
                              ? "Esgotada"
                              : "Ativa"
                        }
                        status={
                          !reward.isActive
                            ? "inactive"
                            : reward.stock === 0
                              ? "pending"
                              : "active"
                        }
                      />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {reward.description || "Sem descrição"}
                    </p>
                    <p className="mt-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-secondary">
                      {reward.costInPoints} PTS · {reward.stock} em estoque
                    </p>
                  </div>
                  <div className="col-span-2 flex flex-wrap gap-2 border-t border-border/80 pt-3">
                    <Badge>Pendentes: {reward.redemptionCounts.PENDING}</Badge>
                    <Badge>
                      Entregues: {reward.redemptionCounts.DELIVERED}
                    </Badge>
                    <Badge>
                      Cancelados: {reward.redemptionCounts.CANCELLED}
                    </Badge>
                    <Button
                      className="ml-auto"
                      disabled={save.isPending}
                      onClick={() => editReward(reward)}
                      variant="outline"
                    >
                      <Pencil />
                      Editar
                    </Button>
                    <Button
                      disabled={save.isPending || toggling}
                      onClick={() => toggleReward(reward)}
                      variant="outline"
                    >
                      {toggling
                        ? "Atualizando..."
                        : reward.isActive
                          ? "Desativar"
                          : "Ativar"}
                    </Button>
                  </div>
                </article>
              );
            })}
            <div className="md:col-span-2">
              <PaginationControls
                page={query.data.meta.page}
                totalPages={query.data.meta.totalPages}
                onPageChange={setPage}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-border bg-card/60 p-6">
            <PackageSearch className="text-primary" />
            <h3 className="mt-3 font-semibold">
              Nenhuma recompensa encontrada
            </h3>
            <p className="text-sm text-muted-foreground">
              Crie o primeiro item ou revise os filtros.
            </p>
          </div>
        )}
      </section>
      <RedemptionHistory
        optionsError={rewardOptions.isError}
        optionsLoading={rewardOptions.isPending}
        onRetryOptions={() => void rewardOptions.refetch()}
        rewards={rewardOptions.data ?? []}
      />
      {toggleIntent ? (
        <AdminReasonDialog
          confirmLabel="Confirmar alteração"
          currentState={toggleIntent.isActive ? "Ativa" : "Inativa"}
          description={`Recompensa ${toggleIntent.name}`}
          intendedState={toggleIntent.isActive ? "Inativa" : "Ativa"}
          onClose={() => setToggleIntent(null)}
          onSubmit={(reason) =>
            toggle.mutateAsync({ reward: toggleIntent, reason })
          }
          operationKey={`${toggleIntent.id}:${String(!toggleIntent.isActive)}`}
          title="Alterar status da recompensa"
        />
      ) : null}
    </div>
  );
}

async function invalidateShop(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["admin", "rewards"] }),
    qc.invalidateQueries({ queryKey: ["admin", "reward-options"] }),
    qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
    qc.invalidateQueries({ queryKey: ["rewards"] }),
  ]);
}

async function fetchAllRewardOptions(signal: AbortSignal) {
  const first = await fetchAdminRewards(
    { page: 1, limit: 100, status: "all" },
    signal,
  );
  const pagination = validateRewardOptionsPage(first, 1);
  const { totalPages } = pagination;
  if (totalPages === 0) return finalizeRewardOptions([], pagination);
  const items = [...first.items];
  const batchSize = 5;
  for (let page = 2; page <= totalPages; page += batchSize) {
    const pages = Array.from(
      { length: Math.min(batchSize, totalPages - page + 1) },
      (_, index) => page + index,
    );
    const responses = await Promise.all(
      pages.map((currentPage) =>
        fetchAdminRewards(
          { page: currentPage, limit: 100, status: "all" },
          signal,
        ),
      ),
    );
    responses.forEach((response, index) => {
      validateRewardOptionsPage(response, pages[index], pagination);
      items.push(...response.items);
    });
  }
  return finalizeRewardOptions(items, pagination);
}
