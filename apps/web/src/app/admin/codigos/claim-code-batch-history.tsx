"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchClaimCodeBatches } from "@/features/actions/actions.service";
import type { ClaimCodeBatchSummary } from "@/features/actions/actions.types";
import { downloadFile } from "@/lib/http/download";
import { PaginationControls } from "../_components/pagination-controls";
import { AdminPanel, AdminSectionHeader } from "../_components/admin-page";

type BatchDownloadKind = "txt" | "pdf" | "pngs";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function ClaimCodeBatchHistory() {
  const [page, setPage] = useState(1);
  const [pendingDownloads, setPendingDownloads] = useState<Set<string>>(
    new Set(),
  );
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["admin", "claim-code-batches", { page, limit: 10 }],
    queryFn: () => fetchClaimCodeBatches({ page, limit: 10 }),
    placeholderData: keepPreviousData,
    retry: false,
  });

  async function downloadArtifact(
    batch: ClaimCodeBatchSummary,
    kind: BatchDownloadKind,
  ) {
    const paths = {
      txt: `/admin/claim-code-batches/${batch.id}/download.txt`,
      pdf: `/admin/claim-code-batches/${batch.id}/qr.pdf`,
      pngs: `/admin/claim-code-batches/${batch.id}/qr-images.zip`,
    } as const;
    const key = `${batch.id}:${kind}`;
    setDownloadError(null);
    setPendingDownloads((current) => new Set(current).add(key));
    try {
      await downloadFile(paths[kind]);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "Não foi possível baixar o artefato.",
      );
    } finally {
      setPendingDownloads((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <section aria-labelledby="claim-code-batch-history-title" className="grid gap-5">
      <AdminSectionHeader
        description="Baixe novamente os arquivos derivados dos códigos persistidos, sem gerar um novo lote."
        eyebrow="rastreabilidade // lotes"
        id="claim-code-batch-history-title"
        title="Histórico de lotes"
      />
      {downloadError ? (
        <p aria-live="polite" className="text-sm text-destructive" role="alert">
          {downloadError}
        </p>
      ) : null}
      {query.isPending ? (
        <p role="status">Carregando lotes...</p>
      ) : query.error ? (
        <div className="grid justify-items-start gap-3" role="alert">
          <p className="text-sm text-destructive">
            {query.error instanceof Error
              ? query.error.message
              : "Não foi possível carregar os lotes."}
          </p>
          <Button
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            variant="outline"
          >
            {query.isFetching ? "Consultando..." : "Tentar novamente"}
          </Button>
        </div>
      ) : query.data?.items.length ? (
        <div className="grid gap-4">
          <AdminPanel className="divide-y divide-border/80 overflow-hidden">
            {query.data.items.map((batch) => (
              <BatchRow
                batch={batch}
                key={batch.id}
                pendingDownloads={pendingDownloads}
                onDownload={downloadArtifact}
              />
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
          Nenhum lote de códigos encontrado.
        </p>
      )}
    </section>
  );
}

function BatchRow({
  batch,
  pendingDownloads,
  onDownload,
}: {
  batch: ClaimCodeBatchSummary;
  pendingDownloads: Set<string>;
  onDownload: (
    batch: ClaimCodeBatchSummary,
    kind: BatchDownloadKind,
  ) => void | Promise<void>;
}) {
  const createdAt = dateTimeFormatter.format(new Date(batch.createdAt));
  const actionButtons: Array<{
    kind: BatchDownloadKind;
    label: string;
  }> = [
    { kind: "txt", label: "Baixar TXT" },
    { kind: "pdf", label: "Baixar PDF" },
    { kind: "pngs", label: "Baixar PNGs" },
  ];

  return (
    <article
      aria-labelledby={`claim-code-batch-${batch.id}`}
      className="grid gap-4 px-4 py-5 transition-colors hover:bg-muted/25 md:px-5"
    >
      <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-5">
        <div>
          <h3 className="text-lg font-semibold" id={`claim-code-batch-${batch.id}`}>
            Lote {batch.id}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {batch.action.name} · {batch.createdQuantity} códigos · {createdAt}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Criado por {batch.createdBy.name} · Motivo: {batch.reason}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          {actionButtons.map(({ kind, label }) => {
            const key = `${batch.id}:${kind}`;
            const isPending = pendingDownloads.has(key);
            return (
              <Button
                disabled={isPending}
                key={kind}
                onClick={() => void onDownload(batch, kind)}
                variant="outline"
              >
                <Download aria-hidden="true" />
                {isPending ? "Baixando..." : label}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span>Total: {batch.createdQuantity}</span>
        <span>Disponíveis: {batch.counts.available}</span>
        <span>Desativados: {batch.counts.disabled}</span>
        <span>Utilizados: {batch.counts.used}</span>
        <span>Bloqueados: {batch.counts.blocked}</span>
      </div>
    </article>
  );
}
