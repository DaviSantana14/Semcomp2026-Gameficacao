"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ParticipantShell } from "@/components/semcomp/participant-shell";
import { Button } from "@/components/ui/button";
import { fetchRewards, redeemReward } from "@/features/rewards/rewards.service";
import type { Reward } from "@/features/rewards/rewards.types";
import type { User } from "@/features/users/users.types";
import { useMe } from "@/hooks/use-auth";
import { ApiError } from "@/lib/http/api-error";
import { RewardCard } from "./reward-card";
import { RewardRedemptionDialog } from "./reward-redemption-dialog";

const numberFormatter = new Intl.NumberFormat("pt-BR");

function ShopLoading({ user }: { user?: User }) {
  const content = (
    <div className="mx-auto flex w-full max-w-7xl animate-pulse flex-col gap-6 motion-reduce:animate-none">
      <div className="h-48 rounded-[22px] border border-border/75 bg-card/70" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-96 rounded-[20px] border border-border/75 bg-card/70" />
        <div className="h-96 rounded-[20px] border border-border/75 bg-card/70" />
        <div className="h-96 rounded-[20px] border border-border/75 bg-card/70" />
      </div>
    </div>
  );

  if (user?.role === "PARTICIPANT") {
    return (
      <ParticipantShell activeHref="/lojinha" user={user}>
        {content}
      </ParticipantShell>
    );
  }

  return (
    <main className="semcomp-atmosphere min-h-dvh px-5 py-8 sm:px-8">
      {content}
    </main>
  );
}

function ShopError({
  message,
  onRetry,
  user,
}: {
  message: string;
  onRetry: () => void;
  user?: User;
}) {
  const content = (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center">
      <div className="w-full rounded-[20px] border border-destructive/30 bg-card/85 p-6 sm:p-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-destructive">
          catálogo interrompido
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase leading-none">
          Lojinha indisponível.
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {message}
        </p>
        <Button className="mt-6" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    </section>
  );

  if (user?.role === "PARTICIPANT") {
    return (
      <ParticipantShell activeHref="/lojinha" user={user}>
        {content}
      </ParticipantShell>
    );
  }

  return <main className="semcomp-atmosphere min-h-dvh p-5">{content}</main>;
}

export function ShopClient() {
  const router = useRouter();
  const {
    data: user,
    error: userError,
    isLoading: isUserLoading,
    refetch,
  } = useMe();

  useEffect(() => {
    if (userError instanceof ApiError && userError.status === 401) {
      router.replace("/login");
    }
  }, [router, userError]);

  useEffect(() => {
    if (user?.role === "ADMIN") router.replace("/admin/lojinha");
  }, [router, user]);

  if (isUserLoading) return <ShopLoading />;

  if (userError) {
    if (userError instanceof ApiError && userError.status === 401) return null;
    return (
      <ShopError
        message={
          userError instanceof ApiError
            ? userError.message
            : "Não foi possível carregar seus dados."
        }
        onRetry={() => void refetch?.()}
      />
    );
  }

  if (!user || user.role !== "PARTICIPANT") return null;

  return <ParticipantShop user={user} />;
}

function ParticipantShop({ user }: { user: User }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const {
    data: rewards,
    error: rewardsError,
    isLoading: isRewardsLoading,
    refetch,
  } = useQuery({
    enabled: user.role === "PARTICIPANT",
    queryKey: ["rewards"],
    queryFn: fetchRewards,
    retry: false,
  });
  const redeemMutation = useMutation({
    mutationFn: (reward: Reward) => redeemReward(reward.id),
    onSuccess: async (redemption) => {
      toast.success(
        `Resgate de ${redemption.reward.name} criado. Retire no evento.`,
      );
      setSelectedReward(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["rewards"] }),
      ]);
    },
  });

  useEffect(() => {
    if (rewardsError instanceof ApiError && rewardsError.status === 401) {
      router.replace("/login");
    }
  }, [rewardsError, router]);

  if (isRewardsLoading) return <ShopLoading user={user} />;

  if (rewardsError) {
    if (rewardsError instanceof ApiError && rewardsError.status === 401) {
      return null;
    }
    return (
      <ShopError
        message={
          rewardsError instanceof ApiError
            ? rewardsError.message
            : "Não foi possível carregar a lojinha."
        }
        onRetry={() => void refetch()}
        user={user}
      />
    );
  }

  const mutationError = redeemMutation.error
    ? redeemMutation.error instanceof ApiError
      ? redeemMutation.error.message
      : "Não foi possível resgatar a recompensa."
    : null;

  function openRedemption(reward: Reward) {
    redeemMutation.reset();
    setSelectedReward(reward);
  }

  function closeRedemption() {
    if (redeemMutation.isPending) return;
    setSelectedReward(null);
    redeemMutation.reset();
  }

  return (
    <ParticipantShell activeHref="/lojinha" user={user}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="grid items-end gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              recompensas // SEMCOMP 2026
            </p>
            <h1 className="mt-3 max-w-4xl font-display text-5xl font-bold uppercase leading-[0.84] tracking-wide text-foreground sm:text-6xl xl:text-7xl">
              Transforme pontos em conquistas.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Use seus PTS para resgatar recompensas. Seu XP e sua posição no
              ranking continuam iguais.
            </p>
          </div>

          <section className="min-w-56 rounded-[20px] border border-secondary/35 bg-secondary/10 p-5">
            <div className="flex items-center gap-2 text-secondary">
              <Coins aria-hidden="true" className="size-4" />
              <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em]">
                saldo atual
              </p>
            </div>
            <p className="mt-3 font-mono text-3xl font-bold text-foreground">
              {numberFormatter.format(user.points)} PTS
            </p>
          </section>
        </header>

        <section aria-labelledby="rewards-title">
          <div className="mb-5 flex items-end gap-3">
            <PackageCheck
              aria-hidden="true"
              className="size-5 text-secondary"
            />
            <div>
              <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-secondary">
                catálogo ativo
              </p>
              <h2 className="mt-1 text-xl font-bold" id="rewards-title">
                Escolha sua recompensa
              </h2>
            </div>
          </div>

          {rewards && rewards.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rewards.map((reward) => (
                <RewardCard
                  key={reward.id}
                  onRedeem={openRedemption}
                  points={user.points}
                  redeeming={
                    redeemMutation.isPending && selectedReward?.id === reward.id
                  }
                  reward={reward}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[20px] border border-border/80 bg-card/70 p-6 text-sm text-muted-foreground">
              Nenhuma recompensa está disponível agora.
            </div>
          )}
        </section>
      </div>

      {selectedReward ? (
        <RewardRedemptionDialog
          error={mutationError}
          onClose={closeRedemption}
          onConfirm={() => redeemMutation.mutate(selectedReward)}
          open
          pending={redeemMutation.isPending}
          points={user.points}
          reward={selectedReward}
        />
      ) : null}
    </ParticipantShell>
  );
}
