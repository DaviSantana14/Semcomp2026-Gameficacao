"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCcw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchParticipantAuditEvents } from "@/features/audit/audit.service";
import type { AuditSnapshot } from "@/features/audit/audit.types";
import { participantQueryKeys } from "@/features/participants/participant-query-keys";
import { PaginationControls } from "../../_components/pagination-controls";
import {
  operationLabels,
  snapshotFieldLabels,
} from "../../auditoria/audit-labels";

const SAFE_FIELDS = new Set([
  "points",
  "xp",
  "storedPoints",
  "storedXp",
  "ledgerPoints",
  "ledgerXp",
  "pointsDifference",
  "xpDifference",
  "pointEventId",
  "originalPointEventId",
  "reversalPointEventId",
  "status",
  "isActive",
]);
const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ParticipantAuditTimeline({
  participantId,
}: {
  participantId: string;
}) {
  const [page, setPage] = useState(1);
  const filters = { page, limit: 10 };
  const query = useQuery({
    queryKey: [...participantQueryKeys.auditEvents(participantId), filters],
    queryFn: () => fetchParticipantAuditEvents(participantId, filters),
    retry: false,
  });
  return (
    <Card className="min-w-0 bg-card/90">
      <CardHeader>
        <p className="font-mono text-xs uppercase text-primary">
          Auditoria // participante
        </p>
        <CardTitle className="mt-1">Linha do tempo administrativa</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {query.isLoading ? (
          <div
            aria-label="Carregando linha do tempo"
            className="grid gap-3"
            role="status"
          >
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : query.error ? (
          <TimelineError
            fetching={query.isFetching}
            retry={() => void query.refetch()}
          />
        ) : query.data?.items.length ? (
          <>
            <ol className="grid gap-3">
              {query.data.items.map((event) => (
                <li
                  className="relative grid gap-2 border-l-2 border-primary/30 pl-4"
                  key={event.id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    <p className="font-bold">
                      {operationLabels[event.operation] ??
                        "Operação administrativa"}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {event.reason}
                  </p>
                  <SafeSnapshot snapshot={event.after} />
                  <time
                    className="font-mono text-xs text-muted-foreground"
                    dateTime={event.createdAt}
                  >
                    {date.format(new Date(event.createdAt))}
                  </time>
                </li>
              ))}
            </ol>
            <PaginationControls
              onPageChange={setPage}
              page={query.data.meta.page}
              totalPages={query.data.meta.totalPages}
            />
          </>
        ) : (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhuma ação administrativa registrada para este participante.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function TimelineError({
  fetching,
  retry,
}: {
  fetching: boolean;
  retry: () => void;
}) {
  return (
    <div
      className="grid justify-items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
      role="alert"
    >
      <p className="text-sm">
        Não foi possível carregar a linha do tempo. Os demais dados continuam
        disponíveis.
      </p>
      <Button disabled={fetching} onClick={retry} variant="outline">
        <RefreshCcw />
        {fetching ? "Consultando..." : "Tentar novamente"}
      </Button>
    </div>
  );
}

function SafeSnapshot({ snapshot }: { snapshot: AuditSnapshot | null }) {
  if (!snapshot) return null;
  const entries = Object.entries(snapshot).filter(
    ([key, value]) =>
      SAFE_FIELDS.has(key) &&
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"),
  );
  if (!entries.length) return null;
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <div className="flex gap-1" key={key}>
          <dt className="text-muted-foreground">
            {snapshotFieldLabels[key] ?? "Campo"}:
          </dt>
          <dd className="font-mono">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
