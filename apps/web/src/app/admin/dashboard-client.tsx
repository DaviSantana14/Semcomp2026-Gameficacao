"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  KeyRound,
  PackageCheck,
  ShoppingBag,
  UsersRound,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAdminDashboard } from "@/features/dashboard/dashboard.service";
import { ApiError } from "@/lib/http/api-error";
import { cn } from "@/lib/utils";
import { PresenceHistory } from "./_components/presence-history";
import { PresencePanel } from "./_components/presence-panel";

const numberFormatter = new Intl.NumberFormat("pt-BR");
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function DashboardClient() {
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: fetchAdminDashboard,
    retry: false,
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <ErrorState
        error={error}
        isFetching={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }

  if (!data) return <EmptyDashboard />;

  const metrics = [
    {
      icon: UsersRound,
      label: "Participantes",
      note: `${numberFormatter.format(data.participants.active)} ativos`,
      value: numberFormatter.format(data.participants.total),
    },
    {
      icon: Activity,
      label: "Resgates de atividade",
      note: "atividades registradas",
      value: numberFormatter.format(data.activity.redemptions),
    },
    {
      icon: Zap,
      label: "Pontos concedidos",
      note: "em toda a operação",
      value: numberFormatter.format(data.activity.pointsIssued),
    },
    {
      icon: PackageCheck,
      label: "Retiradas pendentes",
      note:
        data.shop.pendingRedemptions > 0
          ? "ação necessária"
          : "operação em dia",
      value: numberFormatter.format(data.shop.pendingRedemptions),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <header className="flex flex-col justify-between gap-5 border-b border-border/80 pb-8 md:flex-row md:items-end">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            operação // tempo real
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-5xl font-bold uppercase leading-[0.84] tracking-wide text-foreground md:text-6xl xl:text-7xl">
            Visão geral do evento.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Acompanhe o fluxo de participantes, pontos e retiradas que exigem
            atenção da equipe.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[11px] bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_color-mix(in_srgb,var(--primary)_16%,transparent)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          href="/admin/participantes"
        >
          Gerenciar participantes
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </header>

      <section aria-labelledby="metrics-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              agora
            </p>
            <h2 className="mt-1 text-xl font-bold" id="metrics-title">
              Pulso da operação
            </h2>
          </div>
          <span className="inline-flex items-center gap-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary shadow-[0_0_10px_color-mix(in_srgb,var(--primary)_75%,transparent)]" />
            dados atualizados
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ icon: Icon, label, note, value }, index) => (
            <article
              className={cn(
                "rounded-[18px] border border-border/80 bg-card/75 p-5 backdrop-blur",
                index === 3 &&
                  data.shop.pendingRedemptions > 0 &&
                  "border-primary/45 bg-primary/[0.04]",
              )}
              key={label}
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-muted-foreground">
                  {label}
                </p>
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-4 text-secondary",
                    index === 3 &&
                      data.shop.pendingRedemptions > 0 &&
                      "text-primary",
                  )}
                />
              </div>
              <p className="mt-5 font-mono text-3xl font-bold tabular-nums text-foreground">
                {value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
        <article className="overflow-hidden rounded-[20px] border border-border/80 bg-card/75 backdrop-blur">
          <header className="flex flex-col justify-between gap-4 border-b border-border/80 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
            <div>
              <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-primary">
                fila de atendimento
              </p>
              <h2 className="mt-1 text-xl font-bold">Retiradas pendentes</h2>
            </div>
            <span
              className={cn(
                "w-fit rounded-full border px-3 py-1 font-mono text-xs font-semibold",
                data.shop.pendingRedemptions > 0
                  ? "border-primary/35 bg-primary/10 text-primary"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              {numberFormatter.format(data.shop.pendingRedemptions)} na fila
            </span>
          </header>

          {data.recentPendingRedemptions.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
              <CheckCircle2
                aria-hidden="true"
                className="size-7 text-primary"
              />
              <p className="mt-3 font-semibold">Nenhuma retirada pendente.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A fila da lojinha está em dia.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/80">
              {data.recentPendingRedemptions.map((item) => (
                <li
                  className="grid gap-4 px-5 py-4 transition-colors hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
                  key={item.id}
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span
                      aria-hidden="true"
                      className="semcomp-checkpoint text-primary"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">
                        {item.reward.name}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {item.user.name} ·{" "}
                        {numberFormatter.format(item.pointsSpent)} PTS
                      </p>
                    </div>
                  </div>
                  <time
                    className="pl-5 font-mono text-xs text-muted-foreground sm:pl-0"
                    dateTime={item.createdAt}
                  >
                    {dateFormatter.format(new Date(item.createdAt))}
                  </time>
                </li>
              ))}
            </ul>
          )}

          <footer className="border-t border-border/80 px-5 py-4 sm:px-6">
            <Link
              className="group inline-flex items-center gap-2 text-sm font-semibold text-primary"
              href="/admin/lojinha"
            >
              Abrir gestão da lojinha
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>
          </footer>
        </article>

        <div className="grid gap-4">
          <article className="rounded-[20px] border border-secondary/30 bg-secondary/10 p-5 sm:p-6">
            <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-secondary">
              capacidade
            </p>
            <h2 className="mt-2 text-xl font-bold">Participação ativa</h2>
            <div className="mt-5 flex items-end justify-between gap-4">
              <p className="font-mono text-4xl font-bold text-foreground">
                {numberFormatter.format(data.participants.active)}
              </p>
              <p className="pb-1 text-right text-xs leading-5 text-muted-foreground">
                {numberFormatter.format(data.participants.inactive)} inativos
              </p>
            </div>
            <div
              aria-label={`${numberFormatter.format(data.participants.active)} de ${numberFormatter.format(data.participants.total)} participantes ativos`}
              aria-valuemax={data.participants.total}
              aria-valuemin={0}
              aria-valuenow={data.participants.active}
              className="mt-4 h-2 overflow-hidden rounded-full bg-background/70"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-secondary"
                style={{
                  width: `${data.participants.total > 0 ? (data.participants.active / data.participants.total) * 100 : 0}%`,
                }}
              />
            </div>
          </article>

          <article className="rounded-[20px] border border-border/80 bg-card/75 p-5 backdrop-blur sm:p-6">
            <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              acessos rápidos
            </p>
            <div className="mt-4 grid gap-2">
              <Shortcut
                detail={`${numberFormatter.format(data.codes.uniqueAvailable)} códigos únicos disponíveis`}
                href="/admin/codigos"
                icon={KeyRound}
                label="Códigos"
              />
              <Shortcut
                detail="Pontuação e presença"
                href="/admin/atividades"
                icon={Activity}
                label="Atividades"
              />
              <Shortcut
                detail={`${numberFormatter.format(data.shop.rewardsActive)} recompensas ativas`}
                href="/admin/lojinha"
                icon={ShoppingBag}
                label="Lojinha"
              />
            </div>
          </article>
        </div>
      </section>

      <PresencePanel />
      <PresenceHistory />
    </div>
  );
}

function Shortcut({
  detail,
  href,
  icon: Icon,
  label,
}: {
  detail: string;
  href: string;
  icon: typeof UsersRound;
  label: string;
}) {
  return (
    <Link
      className="group flex min-h-14 items-center gap-3 rounded-[13px] border border-transparent px-3 transition-colors hover:border-border hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 text-secondary" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div
      aria-label="Carregando visão geral"
      className="mx-auto grid w-full max-w-7xl gap-7"
      role="status"
    >
      <Skeleton className="h-44 w-full rounded-[20px]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-36 rounded-[18px]" key={index} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Skeleton className="h-80 rounded-[20px]" />
        <Skeleton className="h-80 rounded-[20px]" />
      </div>
    </div>
  );
}

function ErrorState({
  error,
  isFetching,
  onRetry,
}: {
  error: Error;
  isFetching: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      className="mx-auto grid max-w-xl gap-5 rounded-[18px] border border-destructive/40 bg-card/95 p-6"
      role="alert"
    >
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-destructive">
          visão geral indisponível
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold uppercase leading-[0.9]">
          Não foi possível carregar a operação
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {error instanceof ApiError
            ? error.message
            : "Verifique sua conexão e tente novamente."}
        </p>
      </div>
      <Button
        className="w-full sm:w-fit"
        disabled={isFetching}
        onClick={onRetry}
      >
        {isFetching ? "Consultando..." : "Tentar novamente"}
      </Button>
    </div>
  );
}

function EmptyDashboard() {
  return (
    <div className="mx-auto grid max-w-xl gap-3 rounded-[18px] border border-dashed border-border bg-card/80 p-6">
      <h1 className="font-display text-4xl font-bold uppercase leading-[0.9]">
        Operação sem dados
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        As métricas ainda não estão disponíveis. Tente atualizar a visão geral.
      </p>
    </div>
  );
}
