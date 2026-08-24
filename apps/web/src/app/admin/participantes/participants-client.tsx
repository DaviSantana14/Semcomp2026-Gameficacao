"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Search,
  ShieldCheck,
  ShieldOff,
  UserRoundSearch,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  downloadParticipantsExport,
  fetchParticipantsExportCount,
} from "@/features/exports/exports.service";
import {
  fetchAdminParticipants,
  updateParticipantStatus,
} from "@/features/participants/participants.service";
import type { AdminParticipant } from "@/features/participants/participants.types";
import { ApiError } from "@/lib/http/api-error";
import { AdminExportDialog } from "../_components/admin-export-dialog";
import { PaginationControls } from "../_components/pagination-controls";
import { StatusBadge } from "../_components/status-badge";
import { AdminReasonDialog } from "../_components/admin-reason-dialog";
import {
  AdminPageHeader,
  AdminPanel,
  AdminSectionHeader,
  adminSelectClassName,
} from "../_components/admin-page";

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
  const [statusIntent, setStatusIntent] = useState<AdminParticipant | null>(
    null,
  );
  const [exportOpen, setExportOpen] = useState(false);
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
  const countExport = useCallback(
    () =>
      fetchParticipantsExportCount({
        search: search || undefined,
        status: status === "all" ? undefined : status,
      }),
    [search, status],
  );
  const downloadExport = useCallback(
    () =>
      downloadParticipantsExport({
        search: search || undefined,
        status: status === "all" ? undefined : status,
      }),
    [search, status],
  );
  const statusMutation = useMutation({
    mutationFn: async ({
      id,
      isActive,
      reason,
    }: {
      id: string;
      isActive: boolean;
      reason: string;
    }) => {
      return updateParticipantStatus(id, { isActive, reason });
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

  async function toggle(participant: AdminParticipant, reason: string) {
    if (pendingIds.has(participant.id)) return;
    setPendingIds((current) => new Set(current).add(participant.id));
    try {
      await statusMutation.mutateAsync({
        id: participant.id,
        isActive: !participant.isActive,
        reason,
      });
      setStatusIntent(null);
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(participant.id);
        return next;
      });
    }
  }
  const data = participantsQuery.data;

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-8">
      <AdminPageHeader
        description={
          <p>
            Localize inscrições, consulte movimentações e controle o acesso ao
            evento.
          </p>
        }
        eyebrow="pessoas // credenciais"
        title="Participantes"
      />

      <AdminPanel
        aria-labelledby="participant-filters-title"
        className="p-4 md:p-5"
      >
        <h2 className="sr-only" id="participant-filters-title">
          Filtros de participantes
        </h2>
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
              className={adminSelectClassName}
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
        <div className="flex flex-wrap justify-end">
          <Button
            aria-label="Exportar participantes"
            onClick={() => setExportOpen(true)}
            variant="outline"
          >
            <Download aria-hidden="true" />
            Exportar participantes
          </Button>
        </div>
      </AdminPanel>

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
          className="grid gap-5"
        >
          <AdminSectionHeader
            action={
              <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {data.items.filter((item) => item.isActive).length} ativos nesta
                página
              </p>
            }
            description={
              <p aria-live="polite">
                {number.format(data.meta.total)} participante
                {data.meta.total === 1 ? "" : "s"}
              </p>
            }
            eyebrow="resultado"
            id="participants-result-title"
            title="Participantes cadastrados"
          />
          <AdminPanel className="overflow-hidden">
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(18rem,1.3fr)_minmax(17rem,.8fr)_minmax(15rem,auto)] gap-5 border-b border-border/80 bg-muted/30 px-5 py-3 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:grid"
            >
              <span>Participante</span>
              <span>Dados operacionais</span>
              <span className="text-right">Ações</span>
            </div>
            <div className="divide-y divide-border/80">
              {data.items.map((participant) => (
                <ParticipantRow
                  key={participant.id}
                  participant={participant}
                  pending={pendingIds.has(participant.id)}
                  toggle={() => setStatusIntent(participant)}
                />
              ))}
            </div>
          </AdminPanel>
          <PaginationControls
            onPageChange={setPage}
            page={data.meta.page}
            totalPages={data.meta.totalPages}
          />
        </section>
      ) : (
        <div className="grid justify-items-start gap-4 rounded-[20px] border border-dashed border-border bg-card/70 p-6 md:p-8">
          <UserRoundSearch aria-hidden="true" className="size-8 text-primary" />
          <div>
            <h2 className="text-xl font-bold">
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
      {exportOpen ? (
        <AdminExportDialog
          appliedFilters={[
            {
              label: "Busca",
              value: search || "Todos os participantes",
            },
            {
              label: "Status",
              value:
                status === "all"
                  ? "Todos"
                  : status === "active"
                    ? "Ativos"
                    : "Inativos",
            },
          ]}
          count={countExport}
          download={downloadExport}
          onClose={() => setExportOpen(false)}
          title="Exportar participantes"
        />
      ) : null}
      {statusIntent ? (
        <AdminReasonDialog
          confirmLabel={
            statusIntent.isActive
              ? "Confirmar desativação"
              : "Confirmar reativação"
          }
          currentState={statusIntent.isActive ? "Ativo" : "Inativo"}
          description={`Participante ${statusIntent.name}`}
          intendedState={statusIntent.isActive ? "Inativo" : "Ativo"}
          onClose={() => setStatusIntent(null)}
          onSubmit={(reason) => toggle(statusIntent, reason)}
          operationKey={`${statusIntent.id}:${String(!statusIntent.isActive)}`}
          title="Alterar status do participante"
        />
      ) : null}
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
    <article className="grid min-w-0 gap-5 px-4 py-5 transition-colors hover:bg-muted/25 sm:px-5 lg:grid-cols-[minmax(18rem,1.3fr)_minmax(17rem,.8fr)_minmax(15rem,auto)] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="truncate font-semibold text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <dl className="grid grid-cols-3 divide-x divide-border/80 rounded-[11px] border border-border/70 bg-background/35 py-2">
        <Counter label="PTS" value={participant.points} />
        <Counter
          label="Atividades"
          value={participant.actionRedemptionsCount}
        />
        <Counter
          label="Pendentes"
          value={participant.pendingRewardRedemptionsCount}
        />
      </dl>
      <div className="grid grid-cols-2 gap-2 lg:flex lg:justify-end">
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-[11px] border border-border bg-card/50 px-4 text-sm font-semibold transition-colors hover:border-secondary/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    <div className="min-w-0 px-2 text-center">
      <dt className="truncate font-mono text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-sm font-bold tabular-nums text-foreground">
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
        <Skeleton className="h-40 rounded-[18px] lg:h-24" key={index} />
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
      className="grid justify-items-start gap-4 rounded-[18px] border border-destructive/40 bg-destructive/5 p-5"
      role="alert"
    >
      <div>
        <h2 className="text-xl font-bold">
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
