"use client";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchAdminReusableCodes,
  fetchReusableCodeRedemptions,
  updateAction,
} from "@/features/actions/actions.service";
import type { AdminReusableCode } from "@/features/actions/actions.types";
import { ApiError } from "@/lib/http/api-error";
import { PaginationControls } from "../_components/pagination-controls";
import { StatusBadge } from "../_components/status-badge";
import { AdminReasonDialog } from "../_components/admin-reason-dialog";
import { AdminPanel, AdminSectionHeader } from "../_components/admin-page";
const status = {
  ACTIVE: ["Ativo", "active"],
  DISABLED: ["Desativado", "inactive"],
  BLOCKED_BY_ACTION: ["Atividade bloqueada", "pending"],
} as const;
export function ReusableCodeHistory() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminReusableCode | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [toggleIntent, setToggleIntent] = useState<AdminReusableCode | null>(
    null,
  );
  const listRef = useRef<HTMLElement>(null);
  const usesTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const selectedOriginIdRef = useRef<string | null>(null);
  const query = useQuery({
    queryKey: ["admin", "reusable-codes", { page, limit: 10, search }],
    queryFn: () =>
      fetchAdminReusableCodes({ page, limit: 10, search: search || undefined }),
    retry: false,
    placeholderData: keepPreviousData,
  });
  const toggle = useMutation({
    mutationFn: async ({
      c,
      reason,
    }: {
      c: AdminReusableCode;
      reason: string;
    }) => {
      return updateAction(c.id, { isCodeActive: !c.isCodeActive, reason });
    },
    onMutate: ({ c }) => setPendingIds((ids) => new Set(ids).add(c.id)),
    onSuccess: async () => {
      setToggleIntent(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "actions"] }),
        qc.invalidateQueries({ queryKey: ["admin", "reusable-codes"] }),
        qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
      ]);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Não foi possível atualizar.",
      ),
    onSettled: (_, __, { c }) =>
      setPendingIds((ids) => {
        const next = new Set(ids);
        next.delete(c.id);
        return next;
      }),
  });
  const closeRedemptions = () => {
    const originId = selectedOriginIdRef.current;
    setSelected(null);
    requestAnimationFrame(() => {
      const trigger = originId ? usesTriggerRefs.current.get(originId) : null;
      (trigger?.isConnected ? trigger : listRef.current)?.focus();
      selectedOriginIdRef.current = null;
    });
  };
  return (
    <section
      aria-labelledby="reusable-code-history-title"
      className="grid gap-5"
      ref={listRef}
      tabIndex={-1}
    >
      <AdminSectionHeader
        description="Consulte o estado do código e as pessoas que já o utilizaram."
        eyebrow="inventário // reutilizável"
        id="reusable-code-history-title"
        title="Códigos reutilizáveis"
      />
      <AdminPanel className="p-4 md:p-5">
        <Input
          aria-label="Buscar código reutilizável"
          placeholder="Buscar atividade ou código"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </AdminPanel>
      {query.isPending ? (
        <p role="status">Carregando códigos...</p>
      ) : query.error ? (
        <Button className="w-fit" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      ) : query.data?.items.length ? (
        <div className="grid gap-4">
          <AdminPanel className="divide-y divide-border/80 overflow-hidden">
            {query.data.items.map((c) => (
              <article
                className="grid gap-4 px-4 py-5 transition-colors hover:bg-muted/25 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-5"
                key={c.id}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-base font-bold tracking-[0.08em] text-foreground">
                      {c.code}
                    </code>
                    <StatusBadge
                      label={status[c.status][0]}
                      status={status[c.status][1]}
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {c.name} · {c.points} PTS · {c.totalUses} usos · Último uso:{" "}
                    {c.lastUsedAt
                      ? new Date(c.lastUsedAt).toLocaleString("pt-BR")
                      : "nenhum"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button
                    variant="outline"
                    onClick={(event) => {
                      usesTriggerRefs.current.set(c.id, event.currentTarget);
                      selectedOriginIdRef.current = c.id;
                      setSelected(c);
                    }}
                  >
                    Ver usos
                  </Button>
                  <Button
                    disabled={pendingIds.has(c.id)}
                    variant="outline"
                    onClick={() => setToggleIntent(c)}
                  >
                    {pendingIds.has(c.id)
                      ? "Atualizando..."
                      : c.isCodeActive
                        ? "Desativar"
                        : "Ativar"}
                  </Button>
                </div>
                {c.status === "BLOCKED_BY_ACTION" ? (
                  <p className="text-xs text-muted-foreground md:col-span-2">
                    A atividade está inativa e bloqueia o uso deste código. O
                    controle acima reflete o estado próprio do código.
                  </p>
                ) : null}
              </article>
            ))}
          </AdminPanel>
          <PaginationControls
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            onPageChange={setPage}
          />
        </div>
      ) : (
        <p className="rounded-[18px] border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
          Nenhum código reutilizável encontrado.
        </p>
      )}
      {selected ? (
        <Redemptions code={selected} close={closeRedemptions} />
      ) : null}
      {toggleIntent ? (
        <AdminReasonDialog
          confirmLabel="Confirmar alteração"
          currentState={toggleIntent.isCodeActive ? "Ativo" : "Desativado"}
          description={`Código reutilizável ${toggleIntent.code} · ${toggleIntent.name}`}
          intendedState={toggleIntent.isCodeActive ? "Desativado" : "Ativo"}
          onClose={() => setToggleIntent(null)}
          onSubmit={(reason) => toggle.mutateAsync({ c: toggleIntent, reason })}
          operationKey={`${toggleIntent.id}:${String(!toggleIntent.isCodeActive)}`}
          title="Alterar código reutilizável"
        />
      ) : null}
    </section>
  );
}
function Redemptions({
  code,
  close,
}: {
  code: AdminReusableCode;
  close: () => void;
}) {
  const [page, setPage] = useState(1);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sectionRef.current?.focus();
  }, []);
  const query = useQuery({
    queryKey: [
      "admin",
      "reusable-codes",
      code.id,
      "redemptions",
      { page, limit: 10 },
    ],
    queryFn: () => fetchReusableCodeRedemptions(code.id, { page, limit: 10 }),
    retry: false,
    placeholderData: keepPreviousData,
  });
  return (
    <section
      aria-labelledby="uses-title"
      className="grid gap-4 rounded-[18px] border border-secondary/40 bg-secondary/[0.06] p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      tabIndex={-1}
      ref={sectionRef}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold" id="uses-title">
            Usos de {code.code}
          </h3>
          <p className="text-sm text-muted-foreground">{code.name}</p>
        </div>
        <Button
          aria-label="Fechar detalhes de usos"
          onClick={close}
          variant="outline"
        >
          Fechar
        </Button>
      </div>
      {query.isPending ? (
        <p role="status">Carregando usos...</p>
      ) : query.error ? (
        <Button onClick={() => void query.refetch()}>Tentar novamente</Button>
      ) : query.data?.items.length ? (
        <div className="divide-y divide-border/80 border-y border-border/80">
          {query.data.items.map((r) => (
            <article className="py-4" key={r.id}>
              <p className="font-semibold">{r.participant.name}</p>
              <p className="text-sm text-muted-foreground">
                {r.participant.email} · {r.points} PTS ·{" "}
                {new Date(r.createdAt).toLocaleString("pt-BR")}
              </p>
            </article>
          ))}
          <PaginationControls
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            onPageChange={setPage}
          />
        </div>
      ) : (
        <p>Nenhum uso registrado.</p>
      )}
    </section>
  );
}
