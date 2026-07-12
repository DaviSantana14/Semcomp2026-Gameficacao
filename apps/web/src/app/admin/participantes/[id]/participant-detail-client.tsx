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
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, fetchAdminParticipant } from "@/lib/api";
import { StatusBadge } from "../../_components/status-badge";
import { ParticipantPointEvents } from "./participant-point-events";
import { ParticipantRewardHistory } from "./participant-reward-history";

const number = new Intl.NumberFormat("pt-BR");
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ParticipantDetailClient({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["admin", "participant", id],
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
      <div className="rounded-lg border border-dashed border-border bg-card/80 p-6">
        <h1 className="text-2xl font-black">Participante sem dados</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O cadastro não retornou informações para consulta.
        </p>
      </div>
    );

  const participant = query.data;
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6">
      <div>
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/admin/participantes"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Voltar para participantes
        </Link>
      </div>
      <header className="scanline grid gap-5 rounded-lg border border-primary/30 bg-card/90 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:p-6">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
            Participante // prontuário operacional
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="break-words text-3xl font-black tracking-tight md:text-5xl">
              {participant.name}
            </h1>
            <StatusBadge
              label={participant.isActive ? "Ativo" : "Inativo"}
              status={participant.isActive ? "active" : "inactive"}
            />
          </div>
          <p className="mt-3 break-all text-sm text-muted-foreground">
            {participant.email}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            CPF {maskCpf(participant.cpf)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="PTS" value={participant.points} />
          <Metric label="XP" value={participant.xp} />
          <Metric label="Nível" value={participant.level} />
        </div>
      </header>
      <section aria-labelledby="registration-title">
        <h2 className="sr-only" id="registration-title">
          Dados do cadastro
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        </div>
      </section>
      <ParticipantPointEvents participantId={id} />
      <ParticipantRewardHistory participantId={id} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 rounded-md border border-border bg-muted/40 p-3 text-center">
      <p className="font-mono text-[10px] uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-black tabular-nums">
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
    <Card className="bg-card/90">
      <CardContent className="flex items-center gap-3 p-4">
        <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-sm font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
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
      className="grid max-w-xl justify-items-start gap-4 rounded-lg border border-destructive/40 bg-card/95 p-5"
      role="alert"
    >
      <div>
        <h1 className="text-2xl font-black">
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
