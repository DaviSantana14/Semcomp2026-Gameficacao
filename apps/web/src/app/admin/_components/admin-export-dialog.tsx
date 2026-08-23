"use client";

import { AlertTriangle, Download, LoaderCircle, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type {
  AdminExportCount,
  AdminExportFilter,
} from "@/features/exports/exports.types";

const MAX_EXPORT_ROWS = 50_000;

type CountState =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "success"; result: AdminExportCount };

export type AdminExportDialogProps = {
  appliedFilters: readonly AdminExportFilter[] | ReactNode;
  containsPii?: boolean;
  count: () => Promise<AdminExportCount>;
  download: () => Promise<void>;
  onClose: () => void;
  title: string;
};

export function AdminExportDialog({
  appliedFilters,
  containsPii = true,
  count,
  download,
  onClose,
  title,
}: AdminExportDialogProps) {
  const titleId = useId();
  const [countState, setCountState] = useState<CountState>({
    status: "loading",
  });
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadError, setDownloadError] = useState<Error | null>(null);
  const countPendingRef = useRef(false);
  const downloadPendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void loadCount();

    async function loadCount() {
      if (countPendingRef.current) return;
      countPendingRef.current = true;
      setCountState({ status: "loading" });
      try {
        const result = await count();
        if (mountedRef.current) {
          setCountState({ status: "success", result });
        }
      } catch (caught) {
        if (mountedRef.current) {
          setCountState({
            status: "error",
            error: toError(caught, "Não foi possível contar os registros."),
          });
        }
      } finally {
        countPendingRef.current = false;
      }
    }
  }, [count]);

  const maxRows =
    countState.status === "success"
      ? Math.min(countState.result.maxRows, MAX_EXPORT_ROWS)
      : MAX_EXPORT_ROWS;
  const countValue =
    countState.status === "success" ? countState.result.count : null;
  const canDownload =
    countValue !== null && countValue >= 1 && countValue <= maxRows;
  const busy = countState.status === "loading" || downloadPending;

  async function retryCount() {
    if (countPendingRef.current) return;
    countPendingRef.current = true;
    setCountState({ status: "loading" });
    try {
      const result = await count();
      if (mountedRef.current) {
        setCountState({ status: "success", result });
      }
    } catch (caught) {
      if (mountedRef.current) {
        setCountState({
          status: "error",
          error: toError(caught, "Não foi possível contar os registros."),
        });
      }
    } finally {
      countPendingRef.current = false;
    }
  }

  async function handleDownload() {
    if (!canDownload || downloadPendingRef.current) return;
    downloadPendingRef.current = true;
    setDownloadPending(true);
    setDownloadError(null);
    try {
      await download();
      if (mountedRef.current) setDownloadPending(false);
      downloadPendingRef.current = false;
      onClose();
    } catch (caught) {
      downloadPendingRef.current = false;
      if (mountedRef.current) {
        setDownloadPending(false);
        setDownloadError(toError(caught, "Não foi possível gerar o arquivo."));
      }
    }
  }

  return (
    <Dialog onClose={onClose} open preventClose={busy} titleId={titleId}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            exportação administrativa
          </p>
          <h2 className="mt-2 text-2xl font-black" id={titleId}>
            {title}
          </h2>
        </div>
        <Button
          aria-label="Fechar"
          className="size-11 p-0"
          disabled={busy}
          onClick={onClose}
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-5">
        <section
          aria-labelledby={titleId + "-filters"}
          className="rounded-[14px] border border-border/80 bg-muted/25 p-4"
        >
          <h3
            className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
            id={titleId + "-filters"}
          >
            Filtros aplicados
          </h3>
          <AppliedFilters filters={appliedFilters} />
        </section>

        {containsPii ? (
          <div
            className="flex gap-3 rounded-[14px] border border-secondary/40 bg-secondary/10 p-4 text-sm"
            role="note"
          >
            <AlertTriangle aria-hidden="true" />
            <p>
              Este arquivo contém dados pessoais. Armazene e compartilhe a
              exportação somente quando necessário.
            </p>
          </div>
        ) : null}

        <div
          aria-live="polite"
          className="rounded-[14px] bg-background/45 p-4"
          role="status"
        >
          {countState.status === "loading" ? (
            <span className="flex items-center gap-2">
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              Contando registros...
            </span>
          ) : countState.status === "error" ? null : countValue === 0 ? (
            <span>Nenhum registro atende aos filtros.</span>
          ) : countValue !== null && countValue > maxRows ? (
            <span>
              {formatCount(countValue)} acima do limite de{" "}
              {formatCount(maxRows)} registros.
            </span>
          ) : countValue !== null ? (
            <span>
              {formatCount(countValue)} registro{countValue === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {countState.status === "error" ? (
          <div
            className="grid gap-3 rounded-[14px] border border-destructive/40 bg-destructive/5 p-4"
            role="alert"
          >
            <p>{countState.error.message}</p>
            <Button
              className="w-fit"
              disabled={busy}
              onClick={() => void retryCount()}
              variant="outline"
            >
              Tentar novamente
            </Button>
          </div>
        ) : null}

        {downloadError ? (
          <div
            className="rounded-[14px] border border-destructive/40 bg-destructive/5 p-4 text-sm"
            role="alert"
          >
            {downloadError.message}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={busy} onClick={onClose} variant="outline">
            Cancelar
          </Button>
          <Button
            disabled={!canDownload || busy}
            onClick={() => void handleDownload()}
          >
            {downloadPending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Download aria-hidden="true" />
            )}
            {downloadPending ? "Exportando..." : "Exportar CSV"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function AppliedFilters({
  filters,
}: {
  filters: readonly AdminExportFilter[] | ReactNode;
}) {
  if (isFilterList(filters)) {
    return filters.length ? (
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {filters.map((filter) => (
          <div className="min-w-0" key={filter.label}>
            <dt className="text-muted-foreground">{filter.label}</dt>
            <dd className="truncate font-medium">{filter.value}</dd>
          </div>
        ))}
      </dl>
    ) : (
      <p className="mt-3 text-sm text-muted-foreground">
        Nenhum filtro aplicado.
      </p>
    );
  }

  return <div className="mt-3 text-sm">{filters}</div>;
}

function isFilterList(value: unknown): value is readonly AdminExportFilter[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "label" in item &&
        "value" in item,
    )
  );
}

function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function toError(value: unknown, fallback: string) {
  return value instanceof Error ? value : new Error(fallback);
}
