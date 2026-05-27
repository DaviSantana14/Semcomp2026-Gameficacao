"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Coins,
  ImageIcon,
  PackageCheck,
  ShoppingBag,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
import { LogoutButton } from "@/components/logout-button";
import { useMe } from "@/hooks/use-auth";
import {
  ApiError,
  fetchCsrfToken,
  fetchRewards,
  getCsrfToken,
  redeemReward,
  type Reward,
} from "@/lib/api";

function getRedeemDisabledReason(reward: Reward, points: number) {
  if (reward.stock <= 0) {
    return "Esgotado";
  }

  if (points < reward.costInPoints) {
    return "Saldo insuficiente";
  }

  return null;
}

function RewardCard({
  points,
  reward,
  redeemingId,
  onRedeem,
}: {
  points: number;
  reward: Reward;
  redeemingId: string | null;
  onRedeem: (reward: Reward) => void;
}) {
  const disabledReason = getRedeemDisabledReason(reward, points);
  const isRedeeming = redeemingId === reward.id;

  return (
    <Card className="border-primary/20 bg-card/90">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <Badge className="w-fit border-accent/40 bg-accent/10 text-accent">
              <Coins aria-hidden="true" data-icon="inline-start" />
              {reward.costInPoints} PTS
            </Badge>
            <CardTitle className="truncate">{reward.name}</CardTitle>
            <CardDescription>
              {reward.description ?? "Recompensa disponivel na lojinha."}
            </CardDescription>
          </div>
          <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60">
            {reward.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="size-full rounded-lg object-cover"
                src={reward.imageUrl}
              />
            ) : (
              <ImageIcon aria-hidden="true" className="text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/45 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Estoque</span>
          <span className="font-mono font-black">{reward.stock}</span>
        </div>
        <Button
          disabled={Boolean(disabledReason) || isRedeeming}
          onClick={() => onRedeem(reward)}
        >
          <ShoppingBag aria-hidden="true" data-icon="inline-start" />
          {isRedeeming ? "Resgatando..." : disabledReason ?? "Resgatar"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function ShopClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    data: user,
    error: userError,
    isLoading: isUserLoading,
  } = useMe();
  const {
    data: rewards,
    error: rewardsError,
    isLoading: isRewardsLoading,
  } = useQuery({
    queryKey: ["rewards"],
    queryFn: fetchRewards,
    retry: false,
  });
  const redeemMutation = useMutation({
    mutationFn: async (reward: Reward) => {
      if (!getCsrfToken()) {
        await fetchCsrfToken();
      }

      return redeemReward(reward.id);
    },
    onSuccess: (redemption) => {
      toast.success(`Resgate de ${redemption.reward.name} criado.`);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["rewards"] });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError
          ? error.message
          : "Nao foi possivel resgatar a recompensa.";
      toast.error(message);
    },
  });

  useEffect(() => {
    if (userError instanceof ApiError && userError.status === 401) {
      router.replace("/login");
    }
  }, [router, userError]);

  if (isUserLoading || isRewardsLoading) {
    return (
      <main className="arcade-grid min-h-dvh px-4 py-6 md:px-8">
        <div className="mx-auto h-96 w-full max-w-6xl rounded-lg border border-border bg-card" />
      </main>
    );
  }

  if (!user) {
    return null;
  }

  if (rewardsError) {
    const message =
      rewardsError instanceof ApiError
        ? rewardsError.message
        : "Nao foi possivel carregar a lojinha.";

    return (
      <main className="arcade-grid min-h-dvh px-4 py-6 md:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <Button
            className="w-fit"
            onClick={() => router.push("/home")}
            variant="outline"
          >
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Voltar
          </Button>
          <Card className="border-destructive/30 bg-card/90">
            <CardHeader>
              <CardTitle>Lojinha indisponivel</CardTitle>
              <CardDescription>{message}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    );
  }

  function handleRedeem(reward: Reward) {
    const confirmed = window.confirm(
      `Resgatar ${reward.name} por ${reward.costInPoints} PTS?`,
    );

    if (confirmed) {
      redeemMutation.mutate(reward);
    }
  }

  return (
    <main className="arcade-grid min-h-dvh px-4 py-6 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button
            className="w-full sm:w-fit"
            onClick={() => router.push("/home")}
            variant="outline"
          >
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Voltar
          </Button>
          <LogoutButton className="w-full sm:w-fit" />
        </div>

        <header className="scanline relative overflow-hidden rounded-lg border border-primary/30 bg-card/85 p-5 shadow-[0_0_80px_color-mix(in_srgb,var(--primary)_14%,transparent)] md:p-6">
          <div className="relative z-10 flex flex-col gap-4">
            <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">
              <PackageCheck aria-hidden="true" data-icon="inline-start" />
              Lojinha
            </Badge>
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-black tracking-normal md:text-5xl">
                Troque points por recompensas
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Seu saldo atual e {user.points} PTS. Resgates descontam apenas
                points; XP e ranking nao mudam.
              </p>
            </div>
          </div>
        </header>

        {rewards && rewards.length > 0 ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rewards.map((reward) => (
              <RewardCard
                key={reward.id}
                onRedeem={handleRedeem}
                points={user.points}
                redeemingId={
                  redeemMutation.isPending
                    ? redeemMutation.variables?.id ?? null
                    : null
                }
                reward={reward}
              />
            ))}
          </section>
        ) : (
          <Card className="border-border bg-card/90">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Nenhuma recompensa ativa cadastrada.
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
