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
  ActionType,
  AdminAction,
  ApiError,
  createAction,
  fetchAdminActions,
  fetchCsrfToken,
  getCsrfToken,
  updateAction,
  UpdateActionPayload,
} from "@/lib/api";
import { PaginationControls } from "../_components/pagination-controls";
import { StatusBadge } from "../_components/status-badge";

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
};

export function ActionsClient() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<AdminAction | null>(null);
  const [form, setForm] = useState(empty);
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());
  const query = useQuery({
    queryKey: ["admin", "actions", { page, limit: 10, search }],
    queryFn: () =>
      fetchAdminActions({ page, limit: 10, search: search || undefined }),
    retry: false,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!getCsrfToken()) await fetchCsrfToken();
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
    }) => {
      if (!getCsrfToken()) await fetchCsrfToken();
      return updateAction(v.a.id, { [v.field]: !v.a[v.field] });
    },
    onMutate: (v) =>
      setPendingToggles((keys) => new Set(keys).add(`${v.a.id}:${v.field}`)),
    onSuccess: async (_, v) => {
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
    setEditing(a);
    setForm({
      name: a.name,
      description: a.description ?? "",
      type: a.type,
      points: a.points,
      code: a.code ?? "",
      isActive: a.isActive,
      isCodeActive: a.isCodeActive,
    });
    scrollTo({ top: 0, behavior: "smooth" });
  }
  function submit(e: FormEvent) {
    e.preventDefault();
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
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Tipo">
                <select
                  className="min-h-11 rounded-md border border-input bg-muted px-3"
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
                  placeholder="Ex.: PALESTRA1"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Descrição">
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </Field>
            {editing && form.points !== editing.points ? (
              <p className="text-sm text-accent">
                A alteração de pontos afeta somente resgates futuros.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button disabled={save.isPending}>
                <Plus />
                {save.isPending
                  ? "Salvando..."
                  : editing
                    ? "Salvar alterações"
                    : "Criar atividade"}
              </Button>
              {editing ? (
                <Button
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
        <Button variant="outline">Buscar</Button>
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
              className="grid gap-4 rounded-lg border bg-card/90 p-4 lg:grid-cols-[1fr_auto]"
              key={a.id}
            >
              <div>
                <div className="flex flex-wrap gap-2">
                  <h2 className="font-black">{a.name}</h2>
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
                <Button variant="outline" onClick={() => edit(a)}>
                  <Pencil />
                  Editar
                </Button>
                <Button
                  disabled={pendingToggles.has(`${a.id}:isActive`)}
                  variant="outline"
                  onClick={() => toggle.mutate({ a, field: "isActive" })}
                >
                  {pendingToggles.has(`${a.id}:isActive`)
                    ? "Atualizando atividade..."
                    : a.isActive
                      ? "Desativar atividade"
                      : "Ativar atividade"}
                </Button>
                {a.code ? (
                  <Button
                    disabled={pendingToggles.has(`${a.id}:isCodeActive`)}
                    variant="outline"
                    onClick={() => toggle.mutate({ a, field: "isCodeActive" })}
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
