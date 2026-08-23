"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, RotateCcw, UserRoundCog } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createOperator,
  fetchOperators,
  resetOperatorActivation,
  updateOperator,
  updateOperatorStatus,
} from "@/features/operators/operators.service";
import type {
  AdminOperator,
  OperatorActivationResult,
  OperatorsFilters,
} from "@/features/operators/operators.types";
import { ApiError } from "@/lib/http/api-error";
import { PaginationControls } from "../_components/pagination-controls";
import { AdminReasonDialog } from "../_components/admin-reason-dialog";
import {
  AdminPageHeader,
  AdminPanel,
  AdminSectionHeader,
  adminSelectClassName,
} from "../_components/admin-page";
import { StatusBadge } from "../_components/status-badge";
import { OperatorActivationResultDialog } from "./operator-activation-result-dialog";
import { OperatorFormDialog, type OperatorFormValues } from "./operator-form-dialog";
import { OperatorStatusDialog } from "./operator-status-dialog";

const PAGE_SIZE = 10;

const profileLabels = {
  GENERAL: "Geral",
  SHOP: "Lojinha",
  ACTIVITIES: "Atividades e códigos",
} as const;

const stateLabels = {
  PENDING_ACTIVATION: "Aguardando ativação",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
} as const;

export function OperatorsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<OperatorsFilters["adminProfile"]>();
  const [state, setState] = useState<OperatorsFilters["state"]>();
  const [formOperator, setFormOperator] = useState<AdminOperator | null | false>(false);
  const [statusOperator, setStatusOperator] = useState<AdminOperator | null>(null);
  const [resetOperator, setResetOperator] = useState<AdminOperator | null>(null);
  const [activationResult, setActivationResult] = useState<OperatorActivationResult | null>(null);
  const [pending, setPending] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "operators", { page, profile, search, state }],
    queryFn: () =>
      fetchOperators({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        adminProfile: profile,
        state,
      }),
    retry: false,
  });

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchDraft.trim());
    setPage(1);
  }

  async function invalidateList() {
    await queryClient.invalidateQueries({ queryKey: ["admin", "operators"] });
  }

  async function submitForm(values: OperatorFormValues) {
    if (pending) return;
    setPending(true);
    try {
      if (formOperator === null) {
        const result = await createOperator(values);
        setActivationResult(result);
        toast.success("Operador criado.");
      } else if (formOperator) {
        await updateOperator(formOperator.id, values);
        toast.success("Operador atualizado.");
      }
      setFormOperator(false);
      await invalidateList();
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível salvar o operador."));
    } finally {
      setPending(false);
    }
  }

  async function submitStatus(reason: string) {
    if (!statusOperator || pending) return;
    setPending(true);
    try {
      await updateOperatorStatus(statusOperator.id, {
        isActive: !statusOperator.isActive,
        reason,
      });
      setStatusOperator(null);
      toast.success("Status do operador atualizado.");
      await invalidateList();
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível alterar o status."));
    } finally {
      setPending(false);
    }
  }

  async function submitReset(reason: string) {
    if (!resetOperator || pending) return;
    setPending(true);
    try {
      const result = await resetOperatorActivation(resetOperator.id, { reason });
      setResetOperator(null);
      setActivationResult(result);
      toast.success("Novo código de ativação gerado.");
      await invalidateList();
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível gerar um novo código."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-8">
      <AdminPageHeader
        action={
          <Button onClick={() => setFormOperator(null)}>
            <Plus aria-hidden="true" />
            Novo operador
          </Button>
        }
        description={<p>Cadastre operadores, atribua um perfil e controle seu ciclo de ativação.</p>}
        eyebrow="controle // operadores"
        title="Operadores administrativos"
      />
      <AdminPanel className="overflow-hidden">
        <AdminSectionHeader
          className="border-b border-border/80 px-5 py-5 md:px-6"
          description="Apenas administradores gerais podem alterar estes registros."
          eyebrow="filtros de consulta"
          title="Encontrar operador"
        />
        <form className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end md:p-6" onSubmit={runSearch}>
          <label className="grid gap-2 text-sm font-medium">
            Busca
            <Input
              aria-label="Buscar operador"
              placeholder="Nome, CPF ou e-mail"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Perfil
            <select
              aria-label="Filtrar por perfil"
              className={adminSelectClassName}
              value={profile ?? ""}
              onChange={(event) => {
                setProfile((event.target.value || undefined) as OperatorsFilters["adminProfile"]);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="GENERAL">Geral</option>
              <option value="SHOP">Lojinha</option>
              <option value="ACTIVITIES">Atividades e códigos</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Estado
            <select
              aria-label="Filtrar por estado"
              className={adminSelectClassName}
              value={state ?? ""}
              onChange={(event) => {
                setState((event.target.value || undefined) as OperatorsFilters["state"]);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="PENDING_ACTIVATION">Aguardando ativação</option>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          </label>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>
      </AdminPanel>
      <section aria-labelledby="operators-list-title" className="grid gap-5">
        <AdminSectionHeader
          description="Estados derivados do status e da existência de senha, sem um status administrativo paralelo."
          eyebrow="cadastro operacional"
          id="operators-list-title"
          title="Operadores cadastrados"
        />
        <AdminPanel className="overflow-hidden">
          {query.isPending ? (
            <div className="flex items-center gap-2 p-5" role="status">
              Carregando operadores...
            </div>
          ) : query.error ? (
            <div className="p-5" role="alert">
              <p>{errorMessage(query.error, "Não foi possível carregar os operadores.")}</p>
              <Button className="mt-3" onClick={() => void query.refetch()} variant="outline">
                <RefreshCw />
                Tentar novamente
              </Button>
            </div>
          ) : query.data?.items.length ? (
            <>
              <div className="divide-y divide-border/80">
                {query.data.items.map((operator) => (
                  <OperatorRow
                    key={operator.id}
                    onEdit={() => setFormOperator(operator)}
                    onReset={() => setResetOperator(operator)}
                    onStatus={() => setStatusOperator(operator)}
                    operator={operator}
                  />
                ))}
              </div>
              <div className="p-5">
                <PaginationControls
                  page={query.data.meta.page}
                  totalPages={query.data.meta.totalPages}
                  onPageChange={setPage}
                />
              </div>
            </>
          ) : (
            <div className="m-5 rounded-[16px] border border-dashed border-border p-6">
              <UserRoundCog className="text-primary" />
              <h2 className="mt-3 font-semibold">Nenhum operador encontrado</h2>
              <p className="mt-1 text-sm text-muted-foreground">Cadastre o primeiro operador ou revise os filtros.</p>
            </div>
          )}
        </AdminPanel>
      </section>
      {formOperator !== false ? (
        <OperatorFormDialog
          key={formOperator?.id ?? "new"}
          onClose={() => setFormOperator(false)}
          onSubmit={submitForm}
          operator={formOperator}
          pending={pending}
        />
      ) : null}
      {statusOperator ? (
        <OperatorStatusDialog
          onClose={() => setStatusOperator(null)}
          onSubmit={submitStatus}
          operator={statusOperator}
        />
      ) : null}
      {resetOperator ? (
        <AdminReasonDialog
          confirmLabel="Gerar novo código"
          currentState={stateLabels[resetOperator.state]}
          description={`${resetOperator.name} · ${resetOperator.email}`}
          intendedState="Aguardando ativação"
          onClose={() => setResetOperator(null)}
          onSubmit={submitReset}
          operationKey={`${resetOperator.id}:activation-reset`}
          title="Redefinir ativação"
        />
      ) : null}
      <OperatorActivationResultDialog
        key={activationResult?.activationCode ?? "empty"}
        onClose={() => setActivationResult(null)}
        result={activationResult}
      />
    </div>
  );
}

function OperatorRow({
  onEdit,
  onReset,
  onStatus,
  operator,
}: {
  onEdit: () => void;
  onReset: () => void;
  onStatus: () => void;
  operator: AdminOperator;
}) {
  const status = operator.state === "ACTIVE" ? "active" : operator.state === "INACTIVE" ? "inactive" : "pending";
  return (
    <article className="grid min-w-0 gap-4 px-4 py-5 md:px-5 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="break-words font-semibold">{operator.name}</h3>
          <StatusBadge label={stateLabels[operator.state]} status={status} />
        </div>
        <p className="mt-2 break-words text-sm text-muted-foreground">
          {profileLabels[operator.adminProfile]} · {operator.email} · CPF {operator.cpf}
        </p>
        {operator.activationExpiresAt ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Código válido até {new Date(operator.activationExpiresAt).toLocaleString("pt-BR")}.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button onClick={onEdit} variant="outline">Editar</Button>
        <Button onClick={onStatus} variant="outline">
          {operator.isActive ? "Inativar" : "Reativar"}
        </Button>
        <Button onClick={onReset} variant="outline">
          <RotateCcw />
          Redefinir ativação
        </Button>
      </div>
    </article>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
