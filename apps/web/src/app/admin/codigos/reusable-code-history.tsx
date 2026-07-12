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
  AdminReusableCode,
  ApiError,
  fetchAdminReusableCodes,
  fetchCsrfToken,
  fetchReusableCodeRedemptions,
  getCsrfToken,
  updateAction,
} from "@/lib/api";
import { PaginationControls } from "../_components/pagination-controls";
import { StatusBadge } from "../_components/status-badge";
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
    mutationFn: async (c: AdminReusableCode) => {
      if (!getCsrfToken()) await fetchCsrfToken();
      return updateAction(c.id, { isCodeActive: !c.isCodeActive });
    },
    onMutate: (c) => setPendingIds((ids) => new Set(ids).add(c.id)),
    onSuccess: async () => {
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
    onSettled: (_, __, c) =>
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
    <section className="grid gap-4" ref={listRef} tabIndex={-1}>
      <h2 className="text-2xl font-black">Códigos reutilizáveis</h2>
      <Input
        aria-label="Buscar código reutilizável"
        placeholder="Buscar atividade ou código"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      {query.isPending ? (
        <p role="status">Carregando códigos...</p>
      ) : query.error ? (
        <Button className="w-fit" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      ) : query.data?.items.length ? (
        <div className="grid gap-3">
          {query.data.items.map((c) => (
            <article
              className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_auto]"
              key={c.id}
            >
              <div>
                <div className="flex flex-wrap gap-2">
                  <code className="font-bold">{c.code}</code>
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
              <div className="flex gap-2">
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
                  onClick={() => toggle.mutate(c)}
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
          <PaginationControls
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            onPageChange={setPage}
          />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-6">
          Nenhum código reutilizável encontrado.
        </p>
      )}
      {selected ? (
        <Redemptions code={selected} close={closeRedemptions} />
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
      className="grid gap-4 rounded-lg border border-primary/40 bg-card p-5"
      tabIndex={-1}
      ref={sectionRef}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black" id="uses-title">
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
        <div className="grid gap-2">
          {query.data.items.map((r) => (
            <article className="rounded-md bg-muted p-3" key={r.id}>
              <p className="font-bold">{r.participant.name}</p>
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
