"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  downloadClaimCodeBulkReport,
  fetchClaimCodeBulkOperation,
} from "@/features/actions/actions.service";
import type {
  ClaimCodeBulkOperationDetail,
  ClaimCodeBulkOperationItem,
  ClaimCodeBulkOutcome,
} from "@/features/actions/actions.types";
import { AdminPanel, AdminSectionHeader } from "../_components/admin-page";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const outcomeSections: Array<{
  outcome: ClaimCodeBulkOutcome;
  title: string;
  count: (operation: ClaimCodeBulkOperationDetail) => number;
}> = [
  {
    outcome: "CHANGED",
    title: "Alterados",
    count: (operation) => operation.counts.changed,
  },
  {
    outcome: "ALREADY_IN_STATE",
    title: "Sem alteração",
    count: (operation) => operation.counts.unchanged,
  },
  {
    outcome: "ALREADY_USED",
    title: "Já utilizados",
    count: (operation) => operation.counts.used,
  },
  {
    outcome: "NOT_FOUND",
    title: "Não encontrados",
    count: (operation) => operation.counts.notFound,
  },
];

export function ClaimCodeBulkReport({
  onClose,
  operationId,
}: {
  onClose: () => void;
  operationId: string;
}) {
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["admin", "claim-code-bulk-operations", operationId],
    queryFn: () => fetchClaimCodeBulkOperation(operationId),
    placeholderData: keepPreviousData,
    retry: false,
  });

  async function downloadReport() {
    setDownloadPending(true);
    setDownloadError(null);
    try {
      await downloadClaimCodeBulkReport(operationId);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "Não foi possível baixar o relatório.",
      );
    } finally {
      setDownloadPending(false);
    }
  }

  if (query.isPending) {
    return <p role="status">Carregando relatório da operação...</p>;
  }

  if (query.error || !query.data) {
    return (
      <AdminPanel className="grid gap-3 p-5" role="alert">
        <p className="text-sm text-destructive">
          {query.error instanceof Error
            ? query.error.message
            : "Não foi possível carregar o relatório."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void query.refetch()} variant="outline">
            Tentar novamente
          </Button>
          <Button onClick={onClose} variant="ghost">
            Fechar
          </Button>
        </div>
      </AdminPanel>
    );
  }

  const operation = query.data;
  const actionLabel = operation.targetIsActive ? "Ativação" : "Desativação";

  return (
    <section
      aria-labelledby="claim-code-bulk-report-title"
      className="grid gap-5"
    >
      <div className="flex items-start justify-between gap-3">
        <AdminSectionHeader
          description={`${actionLabel} de ${operation.counts.selected} códigos · ${dateTimeFormatter.format(new Date(operation.createdAt))}`}
          eyebrow="rastreabilidade // operação em lote"
          id="claim-code-bulk-report-title"
          title="Relatório da operação"
        />
        <Button aria-label="Fechar relatório" onClick={onClose} variant="ghost">
          <X aria-hidden="true" />
        </Button>
      </div>
      <AdminPanel className="grid gap-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              Motivo:{" "}
              <span className="text-foreground">{operation.reason}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Operação <code className="font-mono">{operation.id}</code>
            </p>
          </div>
          <Button
            disabled={downloadPending}
            onClick={() => void downloadReport()}
            variant="outline"
          >
            <Download aria-hidden="true" />
            {downloadPending ? "Baixando..." : "Baixar relatório CSV"}
          </Button>
        </div>
        {downloadError ? (
          <p
            aria-live="polite"
            className="text-sm text-destructive"
            role="alert"
          >
            {downloadError}
          </p>
        ) : null}
      </AdminPanel>
      <div className="grid gap-4 md:grid-cols-2">
        {outcomeSections.map(({ count, outcome, title }) => {
          const items = operation.items.filter(
            (item) => item.outcome === outcome,
          );
          return (
            <OutcomeSection
              count={count(operation)}
              items={items}
              key={outcome}
              title={title}
            />
          );
        })}
      </div>
    </section>
  );
}

function OutcomeSection({
  count,
  items,
  title,
}: {
  count: number;
  items: ClaimCodeBulkOperationItem[];
  title: string;
}) {
  return (
    <AdminPanel className="grid gap-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="font-mono text-sm text-muted-foreground">{count}</span>
      </div>
      {items.length ? (
        <ul className="grid gap-2 text-sm">
          {items.map((item) => (
            <li
              className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 font-mono"
              key={item.requestedClaimCodeId}
            >
              {item.maskedCode ?? item.requestedClaimCodeId}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum item nesta categoria.
        </p>
      )}
    </AdminPanel>
  );
}
