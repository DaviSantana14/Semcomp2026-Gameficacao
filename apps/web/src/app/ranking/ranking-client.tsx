"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Medal, Trophy, UserRound, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import {
  ApiError,
  fetchRanking,
  type RankingEntry,
  type RankingPeriod,
} from "@/lib/api";

const RANKING_PERIOD_OPTIONS: Array<{
  label: string;
  value: RankingPeriod;
}> = [
  { label: "Geral", value: "all" },
  { label: "Hoje", value: "daily" },
  { label: "Semana", value: "weekly" },
];

const RANKING_PERIOD_COPY: Record<
  RankingPeriod,
  { badge: string; description: string; topDescription: string }
> = {
  all: {
    badge: "Ranking geral",
    description:
      "O ranking usa XP acumulado. Points continuam sendo moeda da lojinha e nao entram no placar.",
    topDescription: "Participantes ativos ordenados por XP acumulado",
  },
  daily: {
    badge: "Ranking de hoje",
    description:
      "O ranking diario usa apenas XP ganho hoje em resgates de atividades. Points da lojinha nao entram no placar.",
    topDescription: "Participantes ativos ordenados por XP ganho hoje",
  },
  weekly: {
    badge: "Ranking semanal",
    description:
      "O ranking semanal usa apenas XP ganho desde segunda-feira em resgates de atividades. Points da lojinha nao entram no placar.",
    topDescription: "Participantes ativos ordenados por XP ganho na semana",
  },
};

function getPositionLabel(position: number) {
  return `#${position.toString().padStart(2, "0")}`;
}

function RankingRow({ entry }: { entry: RankingEntry }) {
  const isPodium = entry.position <= 3;

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-border bg-muted/45 px-3 py-3 md:px-4">
      <div className="flex min-w-14 items-center gap-2 font-mono text-sm font-black text-primary">
        {isPodium ? <Medal aria-hidden="true" className="text-accent" /> : null}
        {getPositionLabel(entry.position)}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground md:text-base">
          {entry.name}
        </p>
        <p className="text-xs uppercase text-muted-foreground">participante</p>
      </div>
      <div className="font-mono text-lg font-black text-primary md:text-xl">
        {entry.xp} XP
      </div>
    </div>
  );
}

export function RankingClient() {
  const router = useRouter();
  const [period, setPeriod] = useState<RankingPeriod>("all");
  const periodCopy = RANKING_PERIOD_COPY[period];
  const {
    data,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["ranking", period, 10],
    queryFn: () => fetchRanking(10, period),
    retry: false,
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace("/login");
    }
  }, [error, router]);

  if (isLoading) {
    return (
      <main className="arcade-grid min-h-dvh px-4 py-6 md:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="h-32 rounded-lg border border-border bg-card" />
          <div className="h-96 rounded-lg border border-border bg-card" />
        </div>
      </main>
    );
  }

  if (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "Nao foi possivel carregar o ranking.";

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
              <CardTitle>Ranking indisponivel</CardTitle>
              <CardDescription>{message}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  const leader = data.ranking[0];

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
          <div className="relative z-10 flex flex-col gap-5">
            <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">
              <Trophy aria-hidden="true" data-icon="inline-start" />
              {periodCopy.badge}
            </Badge>
            <div className="flex flex-col gap-2">
              <p className="font-mono text-sm font-semibold uppercase text-muted-foreground">
                xp leaderboard
              </p>
              <h1 className="text-3xl font-black tracking-normal md:text-5xl">
                Placar competitivo
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                {periodCopy.description}
              </p>
            </div>
            <div className="grid max-w-xl grid-cols-3 gap-2 rounded-lg border border-border bg-muted/45 p-1">
              {RANKING_PERIOD_OPTIONS.map((option) => {
                const isActive = option.value === period;

                return (
                  <Button
                    aria-pressed={isActive}
                    className="h-10"
                    key={option.value}
                    onClick={() => setPeriod(option.value)}
                    variant={isActive ? "primary" : "ghost"}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <Card className="border-primary/25 bg-card/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy aria-hidden="true" className="text-primary" />
                Top 10
              </CardTitle>
              <CardDescription>{periodCopy.topDescription}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {data.ranking.length > 0 ? (
                data.ranking.map((entry) => (
                  <RankingRow
                    key={`${entry.position}-${entry.name}`}
                    entry={entry}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-border bg-muted/45 p-4 text-sm text-muted-foreground">
                  Nenhum participante pontuou ainda.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card className="border-accent/30 bg-card/90">
              <CardHeader>
                <CardDescription>Lideranca atual</CardDescription>
                <CardTitle className="flex items-center gap-2">
                  <Zap aria-hidden="true" className="text-accent" />
                  {leader ? leader.name : "Aguardando XP"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-4xl font-black text-accent">
                  {leader ? `${leader.xp} XP` : "0 XP"}
                </p>
              </CardContent>
            </Card>

            <Card className="border-success/30 bg-card/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserRound aria-hidden="true" className="text-success" />
                  Minha posicao
                </CardTitle>
                <CardDescription>
                  {data.me
                    ? "Sua posicao aparece mesmo fora do Top 10."
                    : "Admins nao participam do ranking competitivo."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.me ? (
                  <RankingRow entry={data.me} />
                ) : (
                  <div className="rounded-lg border border-border bg-muted/45 p-4 text-sm text-muted-foreground">
                    Entre com uma conta participante para disputar o placar.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
