"use client";

import {
  ArrowUpRight,
  Coins,
  Gauge,
  Home,
  Medal,
  QrCode,
  ShoppingBag,
  Sparkles,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { BrandLogo } from "@/components/semcomp/brand-logo";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { User } from "@/features/users/users.types";
import { cn } from "@/lib/utils";
import { RedeemCodeDialog } from "./redeem-code-dialog";

type ParticipantDashboardProps = {
  position: number | null;
  user: User;
};

const numberFormatter = new Intl.NumberFormat("pt-BR");

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatTwoDigits(value: number) {
  return String(value).padStart(2, "0");
}

const navigation = [
  { href: "/home", icon: Home, label: "Início" },
  { href: "/ranking", icon: Medal, label: "Ranking" },
  { href: "/lojinha", icon: ShoppingBag, label: "Lojinha" },
];

export function ParticipantDashboard({
  position,
  user,
}: ParticipantDashboardProps) {
  const [isRedeemOpen, setIsRedeemOpen] = useState(false);
  const levelProgress = Math.max(0, Math.min(100, user.xp % 100));

  const metrics = [
    {
      detail: "experiência acumulada",
      icon: Sparkles,
      label: "Experiência",
      value: `${numberFormatter.format(user.xp)} XP`,
    },
    {
      detail: "saldo disponível",
      icon: Coins,
      label: "Seus pontos",
      value: `${numberFormatter.format(user.points)} PTS`,
    },
    {
      detail: "etapa atual",
      icon: Gauge,
      label: "Progresso",
      value: `Nível ${formatTwoDigits(user.level)}`,
    },
    {
      detail: "entre participantes",
      icon: Trophy,
      label: "Posição geral",
      value: position ? `#${formatTwoDigits(position)}` : "—",
    },
  ];

  return (
    <div className="semcomp-atmosphere min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="border-b border-border/70 bg-background/70 px-5 py-5 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0 lg:px-6 lg:py-7">
        <div className="flex items-center justify-between gap-5 lg:block">
          <BrandLogo className="w-36" priority />
          <span className="rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-secondary lg:mt-6 lg:inline-flex">
            participante
          </span>
        </div>

        <nav aria-label="Navegação principal" className="mt-5 lg:mt-10">
          <ul className="grid grid-cols-3 gap-2 lg:flex lg:flex-col">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isCurrent = item.href === "/home";

              return (
                <li key={item.href}>
                  <Link
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-2 rounded-[11px] px-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:justify-start lg:gap-3 lg:px-3.5",
                      isCurrent && "bg-secondary/10 text-foreground",
                    )}
                    href={item.href}
                  >
                    <span className="semcomp-checkpoint" />
                    <Icon aria-hidden="true" className="size-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-6 hidden border-t border-border/70 pt-6 lg:mt-auto lg:block">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[11px] border border-secondary/35 bg-secondary/10 font-mono text-xs font-bold text-secondary">
              {getInitials(user.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>
          <LogoutButton className="w-full" />
        </div>
      </aside>

      <main className="min-w-0 px-5 py-8 sm:px-8 lg:px-10 lg:py-10 xl:px-14">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
          <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                jornada // nível {formatTwoDigits(user.level)}
              </p>
              <h1 className="max-w-3xl font-display text-5xl font-bold uppercase leading-[0.82] tracking-wide text-foreground sm:text-6xl xl:text-7xl">
                Sua jornada está em movimento.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                Olá, {user.name.split(" ")[0]}. Registre suas atividades, avance
                no evento e acompanhe sua evolução.
              </p>
            </div>
            <div className="lg:hidden">
              <LogoutButton />
            </div>
          </header>

          <section className="journey-hero relative isolate overflow-hidden rounded-[24px] border border-secondary/35 px-6 py-7 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:px-8 sm:py-9 lg:min-h-72 lg:px-10">
            <div className="relative z-10 grid grid-cols-1 items-end gap-x-4 gap-y-7 min-[360px]:grid-cols-[minmax(0,1fr)_7.5rem] lg:min-h-56 lg:grid-cols-[minmax(0,58%)_minmax(18rem,42%)] lg:grid-rows-[1fr_auto] lg:gap-x-6">
              <div className="col-span-1 min-[360px]:col-span-2 lg:col-span-1 lg:row-start-1">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-secondary-foreground/65">
                  checkpoint rápido
                </p>
                <h2 className="mt-3 max-w-xl font-display text-4xl font-bold uppercase leading-[0.86] tracking-wide text-foreground sm:text-5xl">
                  Concluiu uma atividade?
                </h2>
                <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
                  Resgate o código recebido para somar pontos e experiência à
                  sua jornada.
                </p>
              </div>

              <Button
                className="col-start-1 row-start-2 w-fit whitespace-nowrap max-[359px]:w-full"
                onClick={() => setIsRedeemOpen(true)}
              >
                <QrCode aria-hidden="true" data-icon="inline-start" />
                Resgatar código
              </Button>

              <div
                aria-hidden="true"
                className="journey-orbit-stage col-start-1 row-start-3 justify-self-center min-[360px]:col-start-2 min-[360px]:row-start-2 min-[360px]:justify-self-end lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:-mr-16 lg:justify-self-end lg:self-center"
                data-testid="journey-orbit"
              >
                <div className="journey-orbit-outer" />
                <div className="journey-orbit-inner" />
                <div className="journey-level-badge">
                  <span className="font-mono text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground lg:text-[0.65rem]">
                    nível
                  </span>
                  <strong className="font-display text-5xl font-bold leading-none text-primary lg:text-7xl">
                    {formatTwoDigits(user.level)}
                  </strong>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="summary-title">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  status atual
                </p>
                <h2
                  id="summary-title"
                  className="mt-1 text-xl font-bold text-foreground"
                >
                  Seu placar
                </h2>
              </div>
              <Link
                className="group flex items-center gap-2 text-sm font-semibold text-primary"
                href="/ranking"
              >
                Ver ranking
                <ArrowUpRight
                  aria-hidden="true"
                  className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric, index) => {
                const Icon = metric.icon;

                return (
                  <article
                    className={cn(
                      "rounded-[18px] border border-border/80 bg-card/75 p-5 backdrop-blur",
                      index === 3 && "border-primary/25",
                    )}
                    key={metric.label}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-semibold text-muted-foreground">
                        {metric.label}
                      </p>
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "size-4 text-secondary",
                          index === 3 && "text-primary",
                        )}
                      />
                    </div>
                    <p className="mt-5 font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                      {metric.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {metric.detail}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
            <article className="rounded-[20px] border border-border/80 bg-card/75 p-6 backdrop-blur sm:p-7">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-secondary">
                    evolução
                  </p>
                  <h2 className="mt-2 text-xl font-bold">
                    Rumo ao próximo nível
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Continue resgatando atividades para fortalecer seu percurso.
                  </p>
                </div>
                <span className="font-mono text-sm font-bold text-primary">
                  {levelProgress}%
                </span>
              </div>
              <Progress className="mt-7" value={levelProgress} />
              <div className="mt-3 flex justify-between font-mono text-xs text-muted-foreground">
                <span>{numberFormatter.format(user.xp)} XP total</span>
                <span>Nível {formatTwoDigits(user.level + 1)}</span>
              </div>
            </article>

            <article className="rounded-[20px] border border-border/80 bg-card/75 p-6 backdrop-blur sm:p-7">
              <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-secondary">
                continue explorando
              </p>
              <div className="mt-5 grid gap-3">
                <Link
                  className="group flex min-h-14 items-center justify-between rounded-[13px] border border-border bg-background/55 px-4 text-sm font-semibold transition-colors hover:border-secondary/45 hover:bg-secondary/10"
                  href="/ranking"
                >
                  <span className="flex items-center gap-3">
                    <Medal
                      aria-hidden="true"
                      className="size-4 text-secondary"
                    />
                    Ranking geral
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </Link>
                <Link
                  className="group flex min-h-14 items-center justify-between rounded-[13px] border border-border bg-background/55 px-4 text-sm font-semibold transition-colors hover:border-primary/45 hover:bg-primary/5"
                  href="/lojinha"
                >
                  <span className="flex items-center gap-3">
                    <ShoppingBag
                      aria-hidden="true"
                      className="size-4 text-primary"
                    />
                    Lojinha
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            </article>
          </section>
        </div>
      </main>

      <RedeemCodeDialog
        isOpen={isRedeemOpen}
        onClose={() => setIsRedeemOpen(false)}
      />
    </div>
  );
}
