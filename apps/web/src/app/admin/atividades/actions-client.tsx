"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Pencil, Plus, RefreshCw, Zap } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAction,
  fetchAdminActions,
  updateAction,
} from "@/features/actions/actions.service";
import type {
  ActionType,
  AdminAction,
  UpdateActionPayload,
} from "@/features/actions/actions.types";
import { ApiError } from "@/lib/http/api-error";
import { PaginationControls } from "../_components/pagination-controls";
import { StatusBadge } from "../_components/status-badge";
import {
  AdminReasonDialog,
  isValidAdminReason,
  normalizeAdminReason,
} from "../_components/admin-reason-dialog";

const types: ActionType[] = [
  "CHECKIN",
  "ATTENDANCE",
  "STAND_VISIT",
  "EASTER_EGG",
  "QUESTION",
  "DYNAMIC",
  "BONUS",
];
const labels: Record<ActionType, string> = {
  CHECKIN: "Check-in",
  ATTENDANCE: "Presença",
  STAND_VISIT: "Visita a stand",
  EASTER_EGG: "Easter egg",
  QUESTION: "Pergunta",
  DYNAMIC: "Dinâmica",
  BONUS: "Bônus",
};
const empty = {
  name: "",
  description: "",
  type: "CHECKIN" as ActionType,
  points: 10,
  code: "",
  isActive: true,
  isCodeActive: true,
  reason: "",
};

export function ActionsClient() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<AdminAction | null>(null);
  const [form, setForm] = useState(empty);
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());
  const [toggleIntent, setToggleIntent] = useState<{
    a: AdminAction;
    field: "isActive" | "isCodeActive";
  } | null>(null);
  const query = useQuery({
    queryKey: ["admin", "actions", { page, limit: 10, search }],
    queryFn: () =>
      fetchAdminActions({ page, limit: 10, search: search || undefined }),
    retry: false,
  });
  const save = useMutation({
    mutationFn: async () => {
      const code = form.code.trim().toUpperCase();
      if (/^....-....$/.test(code))
        throw new Error(
          "O formato XXXX-XXXX é reservado para códigos de uso único.",
        );
      if (editing) {
        const payload: UpdateActionPayload = {
          name: form.name.trim(),
          description: form.description.trim() || null,
          type: form.type,
          points: form.points,
          code: code || null,
          reason: normalizeAdminReason(form.reason),
        };
        const reusableAffected = (
          ["name", "type", "points", "code"] as const
        ).some((field) => payload[field] !== editing[field]);
        const claimAffected = payload.name !== editing.name;
        const action = await updateAction(editing.id, payload);
        return {
          action,
          mode: "edit" as const,
          reusableAffected,
          claimAffected,
        };
      }
      const action = await createAction({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        points: form.points,
        code: code || undefined,
        isActive: form.isActive,
        reason: normalizeAdminReason(form.reason),
      });
      return {
        action,
        mode: "create" as const,
        reusableAffected: Boolean(code),
        claimAffected: false,
      };
    },
    onSuccess: async (result) => {
      toast.success(
        result.mode === "edit" ? "Atividade atualizada." : "Atividade criada.",
      );
      setEditing(null);
      setForm(empty);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
        qc.invalidateQueries({ queryKey: ["admin", "actions"] }),
        ...(result.reusableAffected
          ? [qc.invalidateQueries({ queryKey: ["admin", "reusable-codes"] })]
          : []),
        ...(result.claimAffected
          ? [qc.invalidateQueries({ queryKey: ["admin", "claim-codes"] })]
          : []),
      ]);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Não foi possível salvar.",
      ),
  });
  const toggle = useMutation({
    mutationFn: async (v: {
      a: AdminAction;
      field: "isActive" | "isCodeActive";
      reason: string;
    }) => {
      return updateAction(v.a.id, {
        [v.field]: !v.a[v.field],
        reason: v.reason,
      });
    },
    onMutate: (v) =>
      setPendingToggles((keys) => new Set(keys).add(`${v.a.id}:${v.field}`)),
    onSuccess: async (_, v) => {
      setToggleIntent(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "actions"] }),
        qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
        qc.invalidateQueries({ queryKey: ["admin", "reusable-codes"] }),
        ...(v.field === "isActive"
          ? [qc.invalidateQueries({ queryKey: ["admin", "claim-codes"] })]
          : []),
      ]);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.message
          : "Não foi possível alterar o status.",
      ),
    onSettled: (_, __, v) =>
      setPendingToggles((keys) => {
        const next = new Set(keys);
        next.delete(`${v.a.id}:${v.field}`);
        return next;
      }),
  });
  function edit(a: AdminAction) {
    if (save.isPending) return;
    setEditing(a);
    setForm({
      name: a.name,
      description: a.description ?? "",
      type: a.type,
      points: a.points,
      code: a.code ?? "",
      isActive: a.isActive,
      isCodeActive: a.isCodeActive,
      reason: "",
    });
    scrollTo({ top: 0, behavior: "smooth" });
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValidAdminReason(form.reason) || save.isPending) return;
    save.mutate();
  }
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <p className="font-mono text-xs uppercase text-primary">
          Operação // Atividades
        </p>
        <h1 className="mt-2 text-3xl font-black md:text-5xl">
          Atividades pontuáveis
        </h1>
        <p className="mt-2 text-muted-foreground">
          Crie, edite e controle separadamente a atividade e seu código
          reutilizável.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>
            {editing ? "Editar atividade" : "Nova atividade"}
          </CardTitle>
          <CardDescription>
            O código é opcional e não pode usar o formato XXXX-XXXX.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome">
                <Input
                  disabled={save.isPending}
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Tipo">
                <select
                  className="min-h-11 rounded-md border border-input bg-muted px-3"
                  disabled={save.isPending}
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as ActionType })
                  }
                >
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {labels[t]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pontos">
                <Input
                  disabled={save.isPending}
                  min={0}
                  required
                  type="number"
                  value={form.points}
                  onChange={(e) =>
                    setForm({ ...form, points: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Código reutilizável">
                <Input
                  disabled={save.isPending}
                  placeholder="Ex.: PALESTRA1"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Descrição">
              <Input
                disabled={save.isPending}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </Field>
            <Field label="Motivo">
              <textarea
                aria-label="Motivo"
                aria-describedby="action-reason-help"
                className="min-h-24 rounded-md border border-input bg-muted px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={save.isPending}
                maxLength={500}
                required
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
              <span
                className="text-xs text-muted-foreground"
                id="action-reason-help"
              >
                Informe de 10 a 500 caracteres.
              </span>
            </Field>
            {editing && form.points !== editing.points ? (
              <p className="text-sm text-accent">
                A alteração de pontos afeta somente resgates futuros.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={save.isPending || !isValidAdminReason(form.reason)}
              >
                <Plus />
                {save.isPending
                  ? "Salvando..."
                  : editing
                    ? "Salvar alterações"
                    : "Criar atividade"}
              </Button>
              {editing ? (
                <Button
                  disabled={save.isPending}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setForm(empty);
                  }}
                >
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft.trim());
          setPage(1);
        }}
      >
        <Input
          aria-label="Buscar atividade"
          placeholder="Buscar por nome ou código"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      {query.isPending ? (
        <div role="status">
          <LoaderCircle className="animate-spin" /> Carregando atividades...
        </div>
      ) : query.error ? (
        <LoadError retry={() => void query.refetch()} />
      ) : query.data?.items.length ? (
        <section className="grid gap-3">
          {query.data.items.map((a) => (
            <article
              className="grid min-w-0 gap-4 rounded-lg border bg-card/90 p-4 lg:grid-cols-[1fr_auto]"
              key={a.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <h2 className="min-w-0 break-words font-black">{a.name}</h2>
                  <StatusBadge
                    label={a.isActive ? "Ativa" : "Inativa"}
                    status={a.isActive ? "active" : "inactive"}
                  />
                  {a.code ? <Badge>{a.code}</Badge> : <Badge>Sem código</Badge>}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {labels[a.type]} · {a.points} PTS · {a.redemptionsCount}{" "}
                  resgates · {a.claimCodes.total} códigos únicos (
                  {a.claimCodes.used} usados, {a.claimCodes.available}{" "}
                  disponíveis)
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={save.isPending}
                  variant="outline"
                  onClick={() => edit(a)}
                >
                  <Pencil />
                  Editar
                </Button>
                <Button
                  disabled={
                    save.isPending || pendingToggles.has(`${a.id}:isActive`)
                  }
                  variant="outline"
                  onClick={() => setToggleIntent({ a, field: "isActive" })}
                >
                  {pendingToggles.has(`${a.id}:isActive`)
                    ? "Atualizando atividade..."
                    : a.isActive
                      ? "Desativar atividade"
                      : "Ativar atividade"}
                </Button>
                {a.code ? (
                  <Button
                    disabled={
                      save.isPending ||
                      pendingToggles.has(`${a.id}:isCodeActive`)
                    }
                    variant="outline"
                    onClick={() =>
                      setToggleIntent({ a, field: "isCodeActive" })
                    }
                  >
                    {pendingToggles.has(`${a.id}:isCodeActive`)
                      ? "Atualizando código..."
                      : a.isCodeActive
                        ? "Desativar código"
                        : "Ativar código"}
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground lg:col-span-2">
                Atividade controla todos os resgates; código reutilizável
                controla apenas o uso repetido deste código.
              </p>
            </article>
          ))}
          <PaginationControls
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            onPageChange={setPage}
          />
        </section>
      ) : (
        <div className="rounded-lg border border-dashed p-6">
          <Zap />
          <h2 className="mt-2 font-black">Nenhuma atividade encontrada</h2>
          <p className="text-sm text-muted-foreground">
            Crie a primeira atividade ou revise a busca.
          </p>
        </div>
      )}
      {toggleIntent ? (
        <AdminReasonDialog
          confirmLabel="Confirmar alteração"
          currentState={
            toggleIntent.a[toggleIntent.field] ? "Ativo" : "Inativo"
          }
          description={
            toggleIntent.field === "isActive"
              ? `Atividade ${toggleIntent.a.name}`
              : `Código reutilizável de ${toggleIntent.a.name}`
          }
          intendedState={
            toggleIntent.a[toggleIntent.field] ? "Inativo" : "Ativo"
          }
          onClose={() => setToggleIntent(null)}
          onSubmit={(reason) => toggle.mutateAsync({ ...toggleIntent, reason })}
          operationKey={`${toggleIntent.a.id}:${toggleIntent.field}:${String(!toggleIntent.a[toggleIntent.field])}`}
          title="Alterar status"
        />
      ) : null}
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Label className="flex flex-col gap-2">
      {label}
      {children}
    </Label>
  );
}
function LoadError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/40 p-5">
      <p>Não foi possível carregar as atividades.</p>
      <Button className="mt-3" onClick={retry} variant="outline">
        <RefreshCw />
        Tentar novamente
      </Button>
    </div>
  );
}
