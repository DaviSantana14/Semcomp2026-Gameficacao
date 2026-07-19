"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trophy, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { BrandLogo } from "@/components/semcomp/brand-logo";
import { ParticipantShell } from "@/components/semcomp/participant-shell";
import { Button } from "@/components/ui/button";
import { fetchRanking } from "@/features/ranking/ranking.service";
import type {
  RankingPeriod,
  RankingResponse,
} from "@/features/ranking/ranking.types";
import type { User } from "@/features/users/users.types";
import { useMe } from "@/hooks/use-auth";
import { ApiError } from "@/lib/http/api-error";
import { RankingPodium } from "./ranking-podium";
import { RankingRow } from "./ranking-row";

const numberFormatter = new Intl.NumberFormat("pt-BR");

const RANKING_PERIOD_OPTIONS: Array<{
  label: string;
  value: RankingPeriod;
}> = [
  { label: "Geral", value: "all" },
  { label: "Hoje", value: "daily" },
];

const RANKING_PERIOD_COPY: Record<
  RankingPeriod,
  { description: string; label: string; listDescription: string }
> = {
  all: {
    description:
      "Acompanhe quem mais avançou com a experiência acumulada durante o evento.",
    label: "jornada completa",
    listDescription: "Participantes ativos por XP acumulado",
  },
  daily: {
    description:
      "Veja quem mais avançou hoje com os resgates de atividades da SEMCOMP.",
    label: "movimento de hoje",
    listDescription: "Participantes ativos por XP conquistado hoje",
  },
};

function RankingLoading() {
  return (
    <main className="semcomp-atmosphere min-h-dvh px-5 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl animate-pulse flex-col gap-6 motion-reduce:animate-none">
        <div className="h-44 rounded-[22px] border border-border/75 bg-card/70" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-72 rounded-[20px] border border-border/75 bg-card/70" />
          <div className="h-72 rounded-[20px] border border-border/75 bg-card/70" />
          <div className="h-72 rounded-[20px] border border-border/75 bg-card/70" />
        </div>
      </div>
    </main>
  );
}

function RankingError({
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
          conexão interrompida
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase leading-none">
          Ranking indisponível.
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
      <ParticipantShell activeHref="/ranking" user={user}>
        {content}
      </ParticipantShell>
    );
  }

  return <main className="semcomp-atmosphere min-h-dvh p-5">{content}</main>;
}

function PeriodSelector({
  onChange,
  period,
}: {
  onChange: (period: RankingPeriod) => void;
  period: RankingPeriod;
}) {
  return (
    <div className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-[13px] border border-border/80 bg-card/70 p-1">
      {RANKING_PERIOD_OPTIONS.map((option) => {
        const isActive = option.value === period;
        return (
          <Button
            aria-pressed={isActive}
            className="h-10"
            key={option.value}
            onClick={() => onChange(option.value)}
            variant={isActive ? "secondary" : "ghost"}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function ParticipantRanking({
  data,
  onPeriodChange,
  period,
  user,
}: {
  data: RankingResponse;
  onPeriodChange: (period: RankingPeriod) => void;
  period: RankingPeriod;
  user: User;
}) {
  const periodCopy = RANKING_PERIOD_COPY[period];
  const leader = data.ranking[0];

  return (
    <ParticipantShell activeHref="/ranking" user={user}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              ranking // {periodCopy.label}
            </p>
            <h1 className="mt-3 max-w-3xl font-display text-5xl font-bold uppercase leading-[0.84] tracking-wide text-foreground sm:text-6xl xl:text-7xl">
              Sua posição na jornada.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {periodCopy.description}
            </p>
          </div>
          <PeriodSelector onChange={onPeriodChange} period={period} />
        </header>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <section aria-labelledby="ranking-list-title" className="min-w-0">
            <div className="mb-5">
              <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-secondary">
                posições em destaque
              </p>
              <h2 className="mt-1 text-xl font-bold" id="ranking-list-title">
                Top 10
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {periodCopy.listDescription}
              </p>
            </div>

            {data.ranking.length > 0 ? (
              <>
                <RankingPodium entries={data.ranking} />
                {data.ranking.length > 3 ? (
                  <div className="mt-6 rounded-[20px] border border-border/80 bg-card/65 px-5 backdrop-blur sm:px-6">
                    {data.ranking.slice(3).map((entry) => (
                      <RankingRow
                        entry={entry}
                        key={`${entry.position}-${entry.name}`}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-[20px] border border-border/80 bg-card/70 p-6 text-sm text-muted-foreground">
                Nenhum participante pontuou ainda.
              </div>
            )}
          </section>

          <aside className="grid gap-4 xl:sticky xl:top-10">
            <section className="rounded-[20px] border border-secondary/35 bg-secondary/8 p-6">
              <div className="flex items-center gap-2 text-secondary">
                <UserRound aria-hidden="true" className="size-4" />
                <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em]">
                  sua posição
                </p>
              </div>
              <h2 className="mt-3 text-xl font-bold">Você no ranking</h2>
              {data.me ? (
                <div className="mt-4">
                  <RankingRow emphasis entry={data.me} />
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    Sua posição aparece aqui mesmo quando estiver fora do Top
                    10.
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Participe para entrar no placar.
                </p>
              )}
            </section>

            <section className="rounded-[20px] border border-border/80 bg-card/70 p-6">
              <div className="flex items-center gap-2 text-primary">
                <Trophy aria-hidden="true" className="size-4" />
                <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em]">
                  referência atual
                </p>
              </div>
              <h2 className="mt-3 text-xl font-bold">Ritmo da liderança</h2>
              <p className="mt-5 font-mono text-3xl font-bold text-foreground">
                {leader ? `${numberFormatter.format(leader.xp)} XP` : "—"}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {leader
                  ? "A experiência que marca a primeira posição neste período."
                  : "A liderança aparece com o primeiro resgate de XP."}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </ParticipantShell>
  );
}

function AdminRankingObserver({
  data,
  onBack,
  onPeriodChange,
  period,
}: {
  data: RankingResponse;
  onBack: () => void;
  onPeriodChange: (period: RankingPeriod) => void;
  period: RankingPeriod;
}) {
  return (
    <main className="semcomp-atmosphere min-h-dvh px-5 py-7 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <BrandLogo className="w-40" priority />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={onBack} variant="outline">
              <ArrowLeft aria-hidden="true" data-icon="inline-start" />
              Voltar ao painel
            </Button>
            <LogoutButton />
          </div>
        </div>

        <header className="rounded-[22px] border border-secondary/25 bg-card/75 p-6 sm:p-8">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
            operação // ranking
          </p>
          <h1 className="mt-3 font-display text-5xl font-bold uppercase leading-none">
            Modo observador
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Acompanhe a disputa sem participar do placar ou receber pontuação.
          </p>
          <div className="mt-6">
            <PeriodSelector onChange={onPeriodChange} period={period} />
          </div>
        </header>

        {data.ranking.length > 0 ? (
          <section aria-label="Classificação observada">
            <RankingPodium entries={data.ranking} />
            <div className="mt-6 rounded-[20px] border border-border/80 bg-card/70 px-5 sm:px-6">
              {data.ranking.slice(3).map((entry) => (
                <RankingRow
                  entry={entry}
                  key={`${entry.position}-${entry.name}`}
                />
              ))}
            </div>
          </section>
        ) : (
          <p className="rounded-[20px] border border-border/80 bg-card/70 p-6 text-sm text-muted-foreground">
            Nenhum participante pontuou ainda.
          </p>
        )}
      </div>
    </main>
  );
}

export function RankingClient() {
  const router = useRouter();
  const [period, setPeriod] = useState<RankingPeriod>("all");
  const {
    data: user,
    error: userError,
    isLoading: isUserLoading,
    refetch: refetchUser,
  } = useMe();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["ranking", period, 10],
    queryFn: () => fetchRanking(10, period),
    retry: false,
  });

  useEffect(() => {
    if (
      (error instanceof ApiError && error.status === 401) ||
      (userError instanceof ApiError && userError.status === 401)
    ) {
      router.replace("/login");
    }
  }, [error, router, userError]);

  if (isLoading || isUserLoading) return <RankingLoading />;

  if (error || userError) {
    const displayError = error ?? userError;
    const message =
      displayError instanceof ApiError
        ? displayError.message
        : "Não foi possível carregar o ranking.";

    return (
      <RankingError
        message={message}
        onRetry={() => {
          void refetch();
          if (userError) void refetchUser?.();
        }}
        user={user}
      />
    );
  }

  if (!data || !user) return null;

  if (user.role === "ADMIN") {
    return (
      <AdminRankingObserver
        data={data}
        onBack={() => router.push("/admin")}
        onPeriodChange={setPeriod}
        period={period}
      />
    );
  }

  return (
    <ParticipantRanking
      data={data}
      onPeriodChange={setPeriod}
      period={period}
      user={user}
    />
  );
}
