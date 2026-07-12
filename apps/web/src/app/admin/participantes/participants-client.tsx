"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ShieldCheck, ShieldOff, UserRoundSearch } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  type AdminParticipant,
  fetchAdminParticipants,
  fetchCsrfToken,
  getCsrfToken,
  updateParticipantStatus,
} from "@/lib/api";
import { PaginationControls } from "../_components/pagination-controls";
import { StatusBadge } from "../_components/status-badge";

const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const number = new Intl.NumberFormat("pt-BR");
const LIMIT = 20;

type StatusFilter = "all" | "active" | "inactive";

export function ParticipantsClient() {
  const queryClient = useQueryClient();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const filters = {
    page,
    limit: LIMIT,
    search: search || undefined,
    status: status === "all" ? undefined : status,
  };
  const participantsQuery = useQuery({
    queryKey: ["admin", "participants", filters],
    queryFn: () => fetchAdminParticipants(filters),
    retry: false,
  });
  const statusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (!getCsrfToken()) await fetchCsrfToken();
      return updateParticipantStatus(id, { isActive });
    },
    onSuccess: (participant) => {
      toast.success(
        participant.isActive
          ? "Participante reativado."
          : "Participante desativado.",
      );
      void queryClient.invalidateQueries({
        queryKey: ["admin", "participants"],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "participant", participant.id],
      });
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível atualizar o status.",
      ),
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  function changeStatus(value: StatusFilter) {
    setStatus(value);
    setPage(1);
  }

  async function toggle(participant: AdminParticipant) {
    if (
      !participant.isActive ||
      window.confirm(
        `Desativar ${participant.name}? A sessão dessa pessoa deixará de funcionar imediatamente.`,
      )
    ) {
      if (pendingIds.has(participant.id)) return;
      setPendingIds((current) => new Set(current).add(participant.id));
      try {
        await statusMutation.mutateAsync({
          id: participant.id,
          isActive: !participant.isActive,
        });
      } finally {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(participant.id);
          return next;
        });
      }
    }
  }
  const data = participantsQuery.data;

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6">
      <header className="grid gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
          Pessoas // credenciais
        </p>
        <h1 className="text-3xl font-black tracking-tight md:text-5xl">
          Participantes
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Localize inscrições, consulte movimentações e controle o acesso ao
          evento.
        </p>
      </header>

      <Card className="bg-card/90">
        <CardContent className="p-4 md:p-5">
          <form
            className="grid gap-4 md:grid-cols-[minmax(0,1fr)_13rem_auto] md:items-end"
            onSubmit={submitSearch}
          >
            <div className="grid gap-2">
              <Label htmlFor="participant-search">Nome, e-mail ou CPF</Label>
              <Input
                autoComplete="off"
                id="participant-search"
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder="Buscar participante"
                value={draftSearch}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="participant-status">Status</Label>
              <select
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id="participant-status"
                onChange={(event) =>
                  changeStatus(event.target.value as StatusFilter)
                }
                value={status}
              >
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </div>
            <Button className="w-full" type="submit">
              <Search aria-hidden="true" />
              Buscar
            </Button>
          </form>
        </CardContent>
      </Card>

      {participantsQuery.isLoading ? (
        <ListSkeleton />
      ) : participantsQuery.error ? (
        <ErrorState
          error={participantsQuery.error}
          isFetching={participantsQuery.isFetching}
          retry={() => void participantsQuery.refetch()}
        />
      ) : data && data.items.length > 0 ? (
        <section
          aria-labelledby="participants-result-title"
          className="grid gap-4"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black" id="participants-result-title">
                Resultado
              </h2>
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {number.format(data.meta.total)} participante
                {data.meta.total === 1 ? "" : "s"}
              </p>
            </div>
            <p className="font-mono text-xs uppercase text-muted-foreground">
              {data.items.filter((item) => item.isActive).length} ativos nesta
              página
            </p>
          </div>
          <div className="grid gap-3">
            {data.items.map((participant) => (
              <ParticipantRow
                key={participant.id}
                participant={participant}
                pending={pendingIds.has(participant.id)}
                toggle={() => void toggle(participant)}
              />
            ))}
          </div>
          <PaginationControls
            onPageChange={setPage}
            page={data.meta.page}
            totalPages={data.meta.totalPages}
          />
        </section>
      ) : (
        <div className="grid justify-items-start gap-3 rounded-lg border border-dashed border-border bg-card/70 p-6">
          <UserRoundSearch aria-hidden="true" className="size-8 text-primary" />
          <div>
            <h2 className="text-xl font-black">
              Nenhum participante encontrado
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Revise a busca ou selecione outro status.
            </p>
          </div>
          {search || status !== "all" ? (
            <Button
              onClick={() => {
                setDraftSearch("");
                setSearch("");
                setStatus("all");
                setPage(1);
              }}
              variant="outline"
            >
              Limpar filtros
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ParticipantRow({
  participant,
  pending,
  toggle,
}: {
  participant: AdminParticipant;
  pending: boolean;
  toggle: () => void;
}) {
  return (
    <article className="grid min-w-0 gap-4 rounded-lg border border-border bg-card/90 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(11rem,.7fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="truncate font-bold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`/admin/participantes/${participant.id}`}
          >
            {participant.name}
          </Link>
          <StatusBadge
            label={participant.isActive ? "Ativo" : "Inativo"}
            status={participant.isActive ? "active" : "inactive"}
          />
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {participant.email}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          <span>CPF {maskCpf(participant.cpf)}</span> · cadastro{" "}
          {date.format(new Date(participant.createdAt))}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <Counter label="PTS" value={participant.points} />
        <Counter
          label="Actions resgatadas"
          value={participant.actionRedemptionsCount}
        />
        <Counter
          label="Rewards pendentes"
          value={participant.pendingRewardRedemptionsCount}
        />
      </dl>
      <div className="grid grid-cols-2 gap-2 lg:flex">
        <Link
          className="inline-flex min-h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/admin/participantes/${participant.id}`}
        >
          Detalhes
        </Link>
        <Button
          aria-label={`${participant.isActive ? "Desativar" : "Reativar"} ${participant.name}`}
          className={
            participant.isActive
              ? "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
              : undefined
          }
          disabled={pending}
          onClick={toggle}
          variant={participant.isActive ? "outline" : "primary"}
        >
          {participant.isActive ? (
            <ShieldOff aria-hidden="true" />
          ) : (
            <ShieldCheck aria-hidden="true" />
          )}
          {pending
            ? "Atualizando..."
            : participant.isActive
              ? "Desativar"
              : "Reativar"}
        </Button>
      </div>
    </article>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/50 p-2 text-center">
      <dt className="truncate font-mono text-[10px] uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-sm font-bold tabular-nums">
        {number.format(value)}
      </dd>
    </div>
  );
}
function maskCpf(cpf: string) {
  const digits = cpf.replace(/\D/g, "");
  return digits.length === 11
    ? `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
    : "***.***.***-**";
}
function ListSkeleton() {
  return (
    <div
      aria-label="Carregando participantes"
      className="grid gap-3"
      role="status"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton className="h-40 lg:h-24" key={index} />
      ))}
    </div>
  );
}
function ErrorState({
  error,
  isFetching,
  retry,
}: {
  error: Error;
  isFetching: boolean;
  retry: () => void;
}) {
  return (
    <div
      className="grid justify-items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-5"
      role="alert"
    >
      <div>
        <h2 className="text-xl font-black">
          Não foi possível carregar participantes
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof ApiError
            ? error.message
            : "Verifique sua conexão e tente novamente."}
        </p>
      </div>
      <Button disabled={isFetching} onClick={retry}>
        {isFetching ? "Consultando..." : "Tentar novamente"}
      </Button>
    </div>
  );
}
