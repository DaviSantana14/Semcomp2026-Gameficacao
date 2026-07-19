"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Gauge,
  LogIn,
  ReceiptText,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAdminParticipant } from "@/features/participants/participants.service";
import { participantQueryKeys } from "@/features/participants/participant-query-keys";
import { ApiError } from "@/lib/http/api-error";
import { StatusBadge } from "../../_components/status-badge";
import { ParticipantPointEvents } from "./participant-point-events";
import { ParticipantRewardHistory } from "./participant-reward-history";
import { ParticipantReconciliationPanel } from "./participant-reconciliation-panel";
import { ParticipantAuditTimeline } from "./participant-audit-timeline";
import { AdminPageHeader, AdminPanel } from "../../_components/admin-page";

const number = new Intl.NumberFormat("pt-BR");
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ParticipantDetailClient({ id }: { id: string }) {
  const query = useQuery({
    queryKey: participantQueryKeys.detail(id),
    queryFn: () => fetchAdminParticipant(id),
    retry: false,
  });

  if (query.isLoading)
    return (
      <div
        aria-label="Carregando participante"
        className="grid gap-5"
        role="status"
      >
        <Skeleton className="h-12 w-44" />
        <Skeleton className="h-64" />
        <Skeleton className="h-80" />
      </div>
    );
  if (query.error)
    return (
      <DetailError
        error={query.error}
        fetching={query.isFetching}
        retry={() => void query.refetch()}
      />
    );
  if (!query.data)
    return (
      <div className="rounded-[18px] border border-dashed border-border bg-card/80 p-6">
        <h1 className="font-display text-4xl font-bold uppercase leading-[0.9]">
          Participante sem dados
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O cadastro não retornou informações para consulta.
        </p>
      </div>
    );

  const participant = query.data;
  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">
      <div>
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-[11px] border border-border bg-card/50 px-4 text-sm font-semibold transition-colors hover:border-secondary/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/admin/participantes"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Voltar para participantes
        </Link>
      </div>
      <AdminPageHeader
        action={
          <div className="grid gap-3">
            <div className="flex justify-start md:justify-end">
              <StatusBadge
                label={participant.isActive ? "Ativo" : "Inativo"}
                status={participant.isActive ? "active" : "inactive"}
              />
            </div>
            <dl className="grid grid-cols-3 divide-x divide-border/80 overflow-hidden rounded-[13px] border border-border/80 bg-card/70 py-3">
              <Metric label="PTS" value={participant.points} />
              <Metric label="XP" value={participant.xp} />
              <Metric label="Nível" value={participant.level} />
            </dl>
          </div>
        }
        description={
          <div className="grid gap-1">
            <p className="break-all">{participant.email}</p>
            <p className="font-mono text-xs">CPF {maskCpf(participant.cpf)}</p>
          </div>
        }
        eyebrow="participante // prontuário operacional"
        title={participant.name}
      />
      <section aria-labelledby="registration-title">
        <h2 className="sr-only" id="registration-title">
          Dados do cadastro
        </h2>
        <AdminPanel className="grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4">
          <Info
            icon={CalendarDays}
            label="Cadastro"
            value={formatDate(participant.createdAt)}
          />
          <Info
            icon={LogIn}
            label="Último login"
            value={
              participant.lastLoginAt
                ? formatDate(participant.lastLoginAt)
                : "Não informado"
            }
          />
          <Info
            icon={ReceiptText}
            label="Movimentações"
            value={number.format(participant.counts.movements)}
          />
          <Info
            icon={ShoppingBag}
            label="Pedidos na lojinha"
            value={number.format(participant.counts.rewards.pending)}
          />
        </AdminPanel>
      </section>
      <ParticipantReconciliationPanel
        balance={{ points: participant.points, xp: participant.xp }}
        participantId={id}
      />
      <ParticipantPointEvents
        balance={{ points: participant.points, xp: participant.xp }}
        participantId={id}
      />
      <ParticipantAuditTimeline participantId={id} />
      <ParticipantRewardHistory participantId={id} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 px-4 text-center">
      <p className="font-mono text-[10px] uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-bold tabular-nums">
        {number.format(value)}
      </p>
    </div>
  );
}
function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/80 p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
      <Icon aria-hidden="true" className="size-5 shrink-0 text-secondary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
function DetailError({
  error,
  fetching,
  retry,
}: {
  error: Error;
  fetching: boolean;
  retry: () => void;
}) {
  return (
    <div
      className="grid max-w-xl justify-items-start gap-4 rounded-[18px] border border-destructive/40 bg-card/95 p-5"
      role="alert"
    >
      <div>
        <h1 className="font-display text-4xl font-bold uppercase leading-[0.9]">
          Não foi possível abrir o participante
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof ApiError
            ? error.message
            : "Verifique sua conexão e tente novamente."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={fetching} onClick={retry}>
          {fetching ? "Consultando..." : "Tentar novamente"}
        </Button>
        <Link
          className="inline-flex min-h-9 items-center rounded-md border border-border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/admin/participantes"
        >
          Voltar
        </Link>
      </div>
    </div>
  );
}
function maskCpf(cpf: string) {
  const digits = cpf.replace(/\D/g, "");
  return digits.length === 11
    ? `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
    : "***.***.***-**";
}
function formatDate(value: string) {
  return dateTime.format(new Date(value));
}
