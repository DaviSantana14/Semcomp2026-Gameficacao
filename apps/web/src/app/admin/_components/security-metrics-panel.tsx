"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, ShieldAlert, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSecurityMetricsOverview } from "@/features/security/security-metrics.service";
import type {
  SecurityMetricsOverview,
  SecurityMetricsStatus,
} from "@/features/security/security-metrics.types";
import { cn } from "@/lib/utils";
import { AdminPanel, AdminSectionHeader } from "./admin-page";

const numberFormatter = new Intl.NumberFormat("pt-BR");
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const metricDefinitions = [
  {
    code: "401",
    icon: ShieldAlert,
    key: "unauthorized",
    label: "Não autorizado",
  },
  {
    code: "403",
    icon: ShieldX,
    key: "forbidden",
    label: "Proibido",
  },
  {
    code: "429",
    icon: Activity,
    key: "rateLimited",
    label: "Limite de requisições",
  },
] as const;

const statusLabels: Record<SecurityMetricsStatus, string> = {
  ATTENTION: "ATENÇÃO",
  DEGRADED: "DEGRADADO",
  NORMAL: "NORMAL",
};

export function SecurityMetricsPanel() {
  const query = useQuery({
    queryKey: ["admin", "security-metrics", "overview"],
    queryFn: fetchSecurityMetricsOverview,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    retry: false,
  });

  if (query.isPending) return <SecurityMetricsSkeleton />;

  if (query.isError || !query.data) {
    return (
      <SecurityMetricsError
        error={query.error}
        isFetching={query.isFetching}
        retry={() => void query.refetch()}
      />
    );
  }

  return (
    <SecurityMetricsOverviewPanel
      data={query.data}
      isFetching={query.isFetching}
    />
  );
}

function SecurityMetricsOverviewPanel({
  data,
  isFetching,
}: {
  data: SecurityMetricsOverview;
  isFetching: boolean;
}) {
  const statusLabel = statusLabels[data.status];
  const statusClassName =
    data.status === "NORMAL"
      ? "border-primary/35 bg-primary/10 text-primary"
      : data.status === "ATTENTION"
        ? "border-accent/40 bg-accent/10 text-accent"
        : "border-destructive/40 bg-destructive/10 text-destructive";

  return (
    <AdminPanel
      aria-labelledby="security-metrics-panel-title"
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
                aria-label={`Status da segurança: ${statusLabel}`}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[0.64rem] font-semibold tracking-[0.1em]",
                  statusClassName,
                )}
                role="status"
              >
                <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                {statusLabel}
              </span>
            </div>
          }
          description={
            <p>
              Contagens agregadas de respostas HTTP protegidas. A coleta pode
              aparecer com atraso de até dois minutos.
            </p>
          }
          eyebrow="telemetria // segurança"
          id="security-metrics-panel-title"
          title="Métricas de segurança"
        />
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-3 sm:p-5">
        {metricDefinitions.map((definition) => (
          <SecurityMetricCard
            data={data}
            definition={definition}
            key={definition.key}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-border/80 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-2 text-muted-foreground">
          <Clock3 aria-hidden="true" className="size-4 text-secondary" />
          {data.lastFlushedMinute ? (
            <>
              Última atualização: {formatDateTime(data.lastFlushedMinute)}
              <time
                className="sr-only"
                dateTime={data.lastFlushedMinute}
              >
                {formatDateTime(data.lastFlushedMinute)}
              </time>
            </>
          ) : (
            "Última atualização: sem coleta registrada"
          )}
        </p>
        <p
          className={cn(
            "font-mono text-[0.65rem] font-semibold uppercase tracking-[0.12em]",
            data.status === "DEGRADED"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {data.status === "DEGRADED"
            ? "dados atrasados"
            : `janela de ${data.thresholds.windowMinutes} minutos`}
        </p>
      </div>
    </AdminPanel>
  );
}

function SecurityMetricCard({
  data,
  definition,
}: {
  data: SecurityMetricsOverview;
  definition: (typeof metricDefinitions)[number];
}) {
  const value = data.periods.fiveMinutes[definition.key];
  const threshold = data.thresholds[definition.key];
  const Icon = definition.icon;
  const thresholdReached = value >= threshold;

  return (
    <article
      aria-labelledby={`security-metric-${definition.key}-title`}
      className={cn(
        "rounded-[18px] border border-border/80 bg-card/65 p-5",
        thresholdReached && "border-accent/40 bg-accent/[0.06]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3
          className="text-sm font-semibold text-muted-foreground"
          id={`security-metric-${definition.key}-title`}
        >
          {definition.label} ({definition.code})
        </h3>
        <Icon
          aria-hidden="true"
          className={cn(
            "size-4 text-secondary",
            thresholdReached && "text-accent",
          )}
        />
      </div>
      <p className="mt-6 font-mono text-4xl font-bold tabular-nums text-foreground">
        {numberFormatter.format(value)}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {thresholdReached
          ? "Limiar atingido"
          : `Limiar: ${numberFormatter.format(threshold)}`}
      </p>
      <p className="mt-4 font-mono text-xs tabular-nums text-muted-foreground">
        1 h: {numberFormatter.format(data.periods.oneHour[definition.key])} · 24
        h: {numberFormatter.format(data.periods.twentyFourHours[definition.key])}
      </p>
    </article>
  );
}

function SecurityMetricsSkeleton() {
  return (
    <div
      aria-label="Carregando métricas de segurança"
      className="grid gap-3"
      role="status"
    >
      <Skeleton className="h-36 rounded-[20px]" />
      <div className="grid gap-3 md:grid-cols-3">
        {metricDefinitions.map((definition) => (
          <Skeleton className="h-44 rounded-[18px]" key={definition.key} />
        ))}
      </div>
    </div>
  );
}

function SecurityMetricsError({
  error,
  isFetching,
  retry,
}: {
  error: unknown;
  isFetching: boolean;
  retry: () => void;
}) {
  return (
    <AdminPanel aria-labelledby="security-metrics-error-title" className="p-5 sm:p-6">
      <div className="grid justify-items-start gap-4" role="alert">
        <div>
          <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-destructive">
            segurança indisponível
          </p>
          <h2
            className="mt-2 text-pretty text-xl font-bold"
            id="security-metrics-error-title"
          >
            Não foi possível atualizar as métricas
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

function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}
