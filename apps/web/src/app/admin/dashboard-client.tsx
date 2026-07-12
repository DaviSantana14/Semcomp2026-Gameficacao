"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  KeyRound,
  PackageCheck,
  ShoppingBag,
  UsersRound,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAdminDashboard } from "@/features/dashboard/dashboard.service";
import { ApiError } from "@/lib/http/api-error";

const number = new Intl.NumberFormat("pt-BR");
const date = new Intl.DateTimeFormat("pt-BR", {
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

  if (!data) {
    return <EmptyDashboard />;
  }

  const inactive = data.participants.inactive;
  const metrics = [
    {
      label: "Participantes",
      value: number.format(data.participants.total),
      note: `${number.format(data.participants.active)} ativos`,
      icon: UsersRound,
    },
    {
      label: "Resgates pendentes",
      value: number.format(data.shop.pendingRedemptions),
      note: "mais antigos primeiro",
      icon: PackageCheck,
    },
    {
      label: "Pontos concedidos",
      value: number.format(data.activity.pointsIssued),
      note: `${number.format(data.activity.redemptions)} resgates de atividades`,
      icon: Zap,
    },
    {
      label: "Códigos",
      value: number.format(data.codes.uniqueAvailable),
      note: `${number.format(data.codes.uniqueUsed)} únicos utilizados · ${number.format(data.codes.reusableActive)} reutilizáveis ativos`,
      icon: KeyRound,
    },
    {
      label: "Lojinha",
      value: data.shop.pendingRedemptions > 0 ? "Atenção" : "Em dia",
      note: `${number.format(data.shop.rewardsActive)} de ${number.format(data.shop.rewardsTotal)} recompensas ativas`,
      icon: ShoppingBag,
    },
  ];

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6">
      <header className="scanline grid gap-4 rounded-lg border border-primary/30 bg-card/90 p-5 md:grid-cols-[1fr_auto] md:items-end md:p-6">
        <div className="grid gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
            Overview // operação em tempo real
          </p>
          <h1 className="text-3xl font-black tracking-tight md:text-5xl">
            Bom trabalho, operador.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Acompanhe a entrada do público, a circulação de pontos e as
            retiradas que precisam de ação.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/admin/participantes"
        >
          Gerenciar participantes
        </Link>
      </header>

      <section
        aria-labelledby="metricas-title"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        <h2 className="sr-only" id="metricas-title">
          Métricas operacionais
        </h2>
        {metrics.map(({ icon: Icon, label, note, value }, index) => (
          <Card
            className={
              index === 1 && data.shop.pendingRedemptions > 0
                ? "border-accent/50 bg-accent/5"
                : "bg-card/90"
            }
            key={label}
          >
            <CardContent className="grid gap-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  {label}
                </p>
                <Icon aria-hidden="true" className="size-4 text-primary" />
              </div>
              <div>
                <p className="font-mono text-3xl font-black tabular-nums">
                  {value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{note}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
        <Card className="bg-card/90">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase text-accent">
                Pulso operacional
              </p>
              <CardTitle className="mt-1">Pedidos urgentes</CardTitle>
            </div>
            <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 font-mono text-xs text-accent">
              {number.format(data.shop.pendingRedemptions)} na fila
            </span>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.recentPendingRedemptions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                Nenhuma retirada pendente.
              </div>
            ) : (
              data.recentPendingRedemptions.map((item) => (
                <div
                  className="grid gap-3 rounded-lg border border-border bg-muted/35 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{item.reward.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {item.user.name} · {number.format(item.pointsSpent)} PTS
                    </p>
                  </div>
                  <time
                    className="font-mono text-xs text-muted-foreground"
                    dateTime={item.createdAt}
                  >
                    {date.format(new Date(item.createdAt))}
                  </time>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Atalhos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Shortcut
              href="/admin/participantes"
              icon={UsersRound}
              label="Participantes"
              detail={`${inactive} inativos`}
            />
            <Shortcut
              href="/admin/atividades"
              icon={Activity}
              label="Atividades"
              detail="Pontuação e presença"
            />
            <Shortcut
              href="/admin/codigos"
              icon={KeyRound}
              label="Códigos"
              detail={`${data.codes.uniqueAvailable} únicos disponíveis`}
            />
            <Shortcut
              href="/admin/lojinha"
              icon={ShoppingBag}
              label="Lojinha"
              detail="Catálogo e entregas"
            />
          </CardContent>
        </Card>
      </div>
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
      className="flex min-h-14 items-center gap-3 rounded-md border border-border bg-muted/30 px-3 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div
      aria-label="Carregando overview"
      className="mx-auto grid w-full max-w-7xl gap-6"
      role="status"
    >
      <Skeleton className="h-44 w-full" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton className="h-36" key={index} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
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
      className="mx-auto grid max-w-xl gap-4 rounded-lg border border-destructive/40 bg-card/95 p-5"
      role="alert"
    >
      <div>
        <p className="font-mono text-xs uppercase text-destructive">
          Overview indisponível
        </p>
        <h1 className="mt-1 text-2xl font-black">
          Não foi possível carregar a operação
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
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
    <div className="mx-auto grid max-w-xl gap-3 rounded-lg border border-dashed border-border bg-card/80 p-6">
      <h1 className="text-2xl font-black">Operação sem dados</h1>
      <p className="text-sm text-muted-foreground">
        As métricas ainda não estão disponíveis. Tente atualizar o overview.
      </p>
    </div>
  );
}
