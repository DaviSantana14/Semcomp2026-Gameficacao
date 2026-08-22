"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarDays, Clock3, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPresenceOverview } from "@/features/presence/presence.service";
import type { PresenceOverview } from "@/features/presence/presence.types";
import { cn } from "@/lib/utils";
import { AdminPanel, AdminSectionHeader } from "./admin-page";

const numberFormatter = new Intl.NumberFormat("pt-BR");
const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const operationalDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "UTC",
});

export function PresencePanel() {
  const query = useQuery({
    queryKey: ["admin", "presence", "overview"],
    queryFn: fetchPresenceOverview,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    retry: false,
  });

  if (query.isPending) return <PresenceSkeleton />;

  if (query.isError || !query.data) {
    return (
      <PresenceError
        error={query.error}
        isFetching={query.isFetching}
        retry={() => void query.refetch()}
      />
    );
  }

  return <PresenceOverviewPanel data={query.data} isFetching={query.isFetching} />;
}

function PresenceOverviewPanel({
  data,
  isFetching,
}: {
  data: PresenceOverview;
  isFetching: boolean;
}) {
  const statusLabel = data.status === "LIVE" ? "AO VIVO" : "DEGRADADO";
  const statusClassName =
    data.status === "LIVE"
      ? "border-primary/35 bg-primary/10 text-primary"
      : "border-accent/40 bg-accent/10 text-accent";

  return (
    <AdminPanel
      aria-labelledby="presence-panel-title"
      className="overflow-hidden border-secondary/25"
    >
      <div className="border-b border-border/80 px-5 py-5 sm:px-6">
        <AdminSectionHeader
          action={
            <div className="flex flex-wrap items-center justify-end gap-3">
              {isFetching ? (
                <span
                  className="font-mono text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                  role="status"
                >
                  Atualizando…
                </span>
              ) : null}
              <span
                aria-label={`Status da coleta: ${statusLabel}`}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[0.64rem] font-semibold tracking-[0.1em]",
                  statusClassName,
                )}
                role="status"
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-current"
                />
                {statusLabel}
              </span>
            </div>
          }
          description={
            <p>
              Um pulso operacional do evento: quem está online agora, o pico
              do dia e a referência geral das coletas retidas.
            </p>
          }
          eyebrow="telemetria // presença"
          id="presence-panel-title"
          title="Presença dos participantes"
        />
      </div>

      <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-[minmax(15rem,0.85fr)_minmax(0,1.15fr)]">
        <article className="relative overflow-hidden rounded-[18px] border border-primary/35 bg-primary/[0.06] p-5 sm:p-6">
          <div
            aria-hidden="true"
            className="absolute -right-10 -top-12 size-40 rounded-full border border-primary/20"
          />
          <div
            aria-hidden="true"
            className="absolute -right-3 -top-5 size-24 rounded-full border border-secondary/25"
          />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-primary">
              <UsersRound aria-hidden="true" className="size-4" />
              <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.16em]">
                Agora
              </p>
            </div>
            <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              janela {data.onlineWindowSeconds}s
            </p>
          </div>
          <p className="relative mt-8 font-mono text-6xl font-bold tabular-nums tracking-[-0.08em] text-foreground sm:text-7xl">
            {numberFormatter.format(data.onlineNow)}
          </p>
          <p className="relative mt-2 text-sm font-semibold text-foreground">
            participantes online
          </p>
          <p className="relative mt-1 max-w-xs text-sm leading-6 text-muted-foreground">
            Consideramos online quem enviou um heartbeat na janela de {" "}
            {data.onlineWindowSeconds} segundos.
          </p>
        </article>

        <div className="grid gap-3 sm:grid-cols-2">
          <PresenceMetric
            detail={formatDate(data.today.operationalDate)}
            icon={CalendarDays}
            label="Pico de hoje"
            value={data.today.peakOnlineParticipants}
          />
          <PresenceMetric
            detail={
              data.overallPeak.operationalDate
                ? formatDate(data.overallPeak.operationalDate)
                : "Sem coleta registrada"
            }
            icon={Activity}
            label="Pico geral"
            value={data.overallPeak.onlineParticipants}
          />
          <PresenceMetric
            detail={`${numberFormatter.format(data.registeredParticipants)} cadastrados agora`}
            icon={UsersRound}
            label="Participantes únicos"
            value={data.uniqueParticipantsEverLogged}
          />
          <PresenceMetric
            detail={`${numberFormatter.format(data.monitoredDays)} dias com coleta`}
            icon={Clock3}
            label="Última coleta"
            value={data.lastCollectedAt ? timeFormatter.format(new Date(data.lastCollectedAt)) : "—"}
            valueIsText
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border/80 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-2 text-muted-foreground">
          <Clock3 aria-hidden="true" className="size-4 text-secondary" />
          {data.lastCollectedAt ? (
            <>
              Última coleta às {timeFormatter.format(new Date(data.lastCollectedAt))}
              <time className="sr-only" dateTime={data.lastCollectedAt}>
                {dateTimeFormatter.format(new Date(data.lastCollectedAt))}
              </time>
            </>
          ) : (
            "Nenhuma coleta registrada ainda"
          )}
        </p>
        <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          heartbeat a cada {data.heartbeatIntervalSeconds}s · janela de {" "}
          {data.onlineWindowSeconds} segundos
        </p>
      </div>
    </AdminPanel>
  );
}

function PresenceMetric({
  detail,
  icon: Icon,
  label,
  value,
  valueIsText = false,
}: {
  detail: string;
  icon: typeof UsersRound;
  label: string;
  value: number | string;
  valueIsText?: boolean;
}) {
  return (
    <article className="rounded-[18px] border border-border/80 bg-card/65 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <Icon aria-hidden="true" className="size-4 text-secondary" />
      </div>
      <p
        className={cn(
          "mt-6 font-mono font-bold tabular-nums text-foreground",
          valueIsText ? "text-2xl" : "text-4xl",
        )}
      >
        {typeof value === "number" ? numberFormatter.format(value) : value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function PresenceSkeleton() {
  return (
    <div
      aria-label="Carregando presença"
      className="grid gap-3"
      role="status"
    >
      <Skeleton className="h-36 rounded-[20px]" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-36 rounded-[18px]" key={index} />
        ))}
      </div>
    </div>
  );
}

function PresenceError({
  error,
  isFetching,
  retry,
}: {
  error: Error | null;
  isFetching: boolean;
  retry: () => void;
}) {
  return (
    <AdminPanel aria-labelledby="presence-error-title" className="p-5 sm:p-6">
      <div className="grid justify-items-start gap-4" role="alert">
        <div>
          <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-destructive">
            presença indisponível
          </p>
          <h2
            className="mt-2 text-pretty text-xl font-bold"
            id="presence-error-title"
          >
            Não foi possível atualizar o pulso
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {error instanceof Error
              ? error.message
              : "Verifique sua conexão e tente novamente."}
          </p>
        </div>
        <Button disabled={isFetching} onClick={retry} variant="outline">
          {isFetching ? "Consultando…" : "Tentar novamente"}
        </Button>
      </div>
    </AdminPanel>
  );
}

function formatDate(value: string): string {
  return operationalDateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}
