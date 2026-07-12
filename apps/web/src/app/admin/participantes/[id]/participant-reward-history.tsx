"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  type AdminRewardRedemptionsFilters,
  type RedemptionStatus,
  fetchAdminParticipantRewardRedemptions,
} from "@/lib/api";
import { PaginationControls } from "../../_components/pagination-controls";
import { StatusBadge } from "../../_components/status-badge";

const LIMIT = 10;
const number = new Intl.NumberFormat("pt-BR");
const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const STATUS: Record<
  RedemptionStatus,
  { label: string; badge: "active" | "inactive" | "pending" }
> = {
  PENDING: { label: "Pendente", badge: "pending" },
  DELIVERED: { label: "Entregue", badge: "active" },
  CANCELLED: { label: "Cancelado", badge: "inactive" },
};

export function ParticipantRewardHistory({
  participantId,
}: {
  participantId: string;
}) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"all" | RedemptionStatus>("all");
  const filters: AdminRewardRedemptionsFilters = {
    page,
    limit: LIMIT,
    status: status === "all" ? undefined : status,
  };
  const query = useQuery({
    queryKey: [
      "admin",
      "participant",
      participantId,
      "reward-redemptions",
      filters,
    ],
    queryFn: () =>
      fetchAdminParticipantRewardRedemptions(participantId, filters),
    retry: false,
  });
  const data = query.data;

  return (
    <Card className="min-w-0 bg-card/90">
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase text-accent">
            Lojinha // pedidos
          </p>
          <CardTitle className="mt-1">Histórico de resgates</CardTitle>
        </div>
        <div className="grid min-w-48 gap-2">
          <Label htmlFor="reward-status">Status</Label>
          <select
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="reward-status"
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
            value={status}
          >
            <option value="all">Todos</option>
            <option value="PENDING">Pendentes</option>
            <option value="DELIVERED">Entregues</option>
            <option value="CANCELLED">Cancelados</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {query.isLoading ? (
          <div
            aria-label="Carregando histórico da lojinha"
            className="grid gap-3"
            role="status"
          >
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton className="h-28" key={index} />
            ))}
          </div>
        ) : query.error ? (
          <div
            className="grid justify-items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            role="alert"
          >
            <div>
              <p className="font-bold">Não foi possível carregar os pedidos</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {query.error instanceof ApiError
                  ? query.error.message
                  : "Tente novamente."}
              </p>
            </div>
            <Button
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              variant="outline"
            >
              <RotateCcw aria-hidden="true" />
              {query.isFetching ? "Consultando..." : "Tentar novamente"}
            </Button>
          </div>
        ) : data && data.items.length > 0 ? (
          <>
            <div className="grid gap-3">
              {data.items.map((item) => {
                const config = STATUS[item.status];
                return (
                  <article
                    className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    key={item.id}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words font-bold">
                          {item.reward.name}
                        </p>
                        <StatusBadge
                          label={config.label}
                          status={config.badge}
                        />
                      </div>
                      <p className="mt-1 font-mono text-sm text-accent">
                        {number.format(item.pointsSpent)} PTS no resgate
                      </p>
                    </div>
                    <dl className="grid gap-1 text-xs text-muted-foreground sm:text-right">
                      <div>
                        <dt className="inline">Pedido: </dt>
                        <dd className="inline">
                          <time dateTime={item.createdAt}>
                            {date.format(new Date(item.createdAt))}
                          </time>
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">Atualizado: </dt>
                        <dd className="inline">
                          <time dateTime={item.updatedAt}>
                            {date.format(new Date(item.updatedAt))}
                          </time>
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
            <PaginationControls
              onPageChange={setPage}
              page={data.meta.page}
              totalPages={data.meta.totalPages}
            />
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
            Nenhum pedido corresponde ao status selecionado.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
