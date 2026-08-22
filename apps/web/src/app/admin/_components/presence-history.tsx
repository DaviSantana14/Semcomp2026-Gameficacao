"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Filter, ListRestart } from "lucide-react";
import {
  type FormEvent,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  downloadPresenceCsv,
  fetchPresenceHistory,
  getDefaultPresenceRange,
} from "@/features/presence/presence.service";
import type {
  PresenceDateRange,
  PresenceHistoryItem,
} from "@/features/presence/presence.types";
import { cn } from "@/lib/utils";
import {
  AdminPanel,
  AdminSectionHeader,
  adminSelectClassName,
} from "./admin-page";

const numberFormatter = new Intl.NumberFormat("pt-BR");
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const operationalDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "UTC",
});
const emptyRange: PresenceDateRange = { from: "", to: "" };
let cachedDefaultRange = emptyRange;
let cachedDefaultRangeKey = "";

export function PresenceHistory() {
  const defaultRange = useDefaultPresenceRange();
  const [draftOverride, setDraftOverride] =
    useState<PresenceDateRange | null>(null);
  const [appliedOverride, setAppliedOverride] =
    useState<PresenceDateRange | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const draft = draftOverride ?? defaultRange;
  const applied =
    appliedOverride ?? (defaultRange.from ? defaultRange : null);

  const query = useQuery({
    queryKey: ["admin", "presence", "history", applied],
    queryFn: () => fetchPresenceHistory(applied!),
    enabled: applied !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });

  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.from || !draft.to || draft.from >= draft.to) {
      setDateError("A data inicial deve ser anterior à data final.");
      return;
    }

    setDateError(null);
    setDownloadError(null);
    setAppliedOverride({ ...draft });
    setDraftOverride({ ...draft });
  }

  function resetRange() {
    const next = getDefaultPresenceRange();
    setDraftOverride(next);
    setAppliedOverride(next);
    setDateError(null);
    setDownloadError(null);
  }

  async function downloadCsv() {
    if (!applied) return;

    setDownloadError(null);
    setIsDownloading(true);
    try {
      await downloadPresenceCsv(applied);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "Não foi possível baixar o CSV.",
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <AdminPanel aria-labelledby="presence-history-title" className="overflow-hidden">
      <div className="border-b border-border/80 px-5 py-5 sm:px-6">
        <AdminSectionHeader
          action={
            <Button
              disabled={isDownloading}
              onClick={() => void downloadCsv()}
              variant="outline"
            >
              <Download aria-hidden="true" />
              {isDownloading ? "Preparando CSV…" : "Baixar CSV"}
            </Button>
          }
          description={
            <p>
              Uma linha por dia monitorado, com horários no fuso de São Paulo.
              O arquivo traz apenas métricas agregadas.
            </p>
          }
          eyebrow="histórico // diário"
          id="presence-history-title"
          title="Histórico de presença"
        />
      </div>

      <form
        aria-label="Filtros do histórico de presença"
        className="grid gap-4 border-b border-border/80 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:p-5"
        onSubmit={applyRange}
      >
        <DateField
          id="presence-from"
          label="Data inicial"
          onChange={(from) =>
            setDraftOverride((current) => ({
              ...(current ?? defaultRange),
              from,
            }))
          }
          value={draft.from}
        />
        <DateField
          id="presence-to"
          label="Data final"
          onChange={(to) =>
            setDraftOverride((current) => ({
              ...(current ?? defaultRange),
              to,
            }))
          }
          value={draft.to}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={resetRange} type="button" variant="ghost">
            <ListRestart aria-hidden="true" />
            Período padrão
          </Button>
          <Button type="submit">
            <Filter aria-hidden="true" />
            Aplicar período
          </Button>
        </div>
        {dateError ? (
          <p
            aria-live="polite"
            className="text-sm font-medium text-destructive sm:col-span-3"
            role="alert"
          >
            {dateError}
          </p>
        ) : null}
        {downloadError ? (
          <p
            aria-live="polite"
            className="text-sm font-medium text-destructive sm:col-span-3"
            role="alert"
          >
            {downloadError}
          </p>
        ) : null}
      </form>

      {query.isPending ? (
        <div
          aria-label="Carregando histórico de presença"
          className="p-5 text-sm text-muted-foreground"
          role="status"
        >
          Consultando dias monitorados…
        </div>
      ) : query.isError ? (
        <HistoryError
          error={query.error}
          isFetching={query.isFetching}
          retry={() => void query.refetch()}
        />
      ) : (
        <PresenceTable items={query.data?.items ?? []} />
      )}
    </AdminPanel>
  );
}

function DateField({
  id,
  label,
  onChange,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        autoComplete="off"
        className={cn(adminSelectClassName, "w-full")}
        id={id}
        name={id}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </div>
  );
}

function PresenceTable({ items }: { items: PresenceHistoryItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table
        aria-label="Histórico diário de presença"
        className="w-full min-w-[54rem] border-collapse text-left text-sm"
      >
        <caption className="sr-only">
          Histórico diário de presença no período aplicado
        </caption>
        <thead className="bg-muted/45 font-mono text-[0.64rem] uppercase tracking-[0.1em] text-muted-foreground">
          <tr>
            <th className="px-5 py-3 font-semibold" scope="col">
              Dia
            </th>
            <th className="px-5 py-3 text-right font-semibold" scope="col">
              Online na última coleta
            </th>
            <th className="px-5 py-3 text-right font-semibold" scope="col">
              Pico online
            </th>
            <th className="px-5 py-3 font-semibold" scope="col">
              Pico às
            </th>
            <th className="px-5 py-3 text-right font-semibold" scope="col">
              Cadastrados no pico
            </th>
            <th className="px-5 py-3 text-right font-semibold" scope="col">
              Logins únicos
            </th>
            <th className="px-5 py-3 text-right font-semibold" scope="col">
              Novos cadastros
            </th>
            <th className="px-5 py-3 font-semibold" scope="col">
              Última coleta
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {items.length > 0 ? (
            items.map((item) => <PresenceRow item={item} key={item.operationalDate} />)
          ) : (
            <tr>
              <td
                className="px-5 py-12 text-center text-muted-foreground"
                colSpan={8}
              >
                Nenhum dia monitorado no período.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PresenceRow({ item }: { item: PresenceHistoryItem }) {
  return (
    <tr className="transition-colors hover:bg-muted/25">
      <th className="whitespace-nowrap px-5 py-4 font-semibold text-foreground" scope="row">
        <time dateTime={item.operationalDate}>{formatDate(item.operationalDate)}</time>
      </th>
      <td className="px-5 py-4 text-right font-mono tabular-nums">
        {numberFormatter.format(item.onlineAtLastCollection)}
      </td>
      <td className="px-5 py-4 text-right font-mono font-semibold tabular-nums text-primary">
        {numberFormatter.format(item.peakOnlineParticipants)}
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
        {item.peakAt ? formatDateTime(item.peakAt) : "—"}
      </td>
      <td className="px-5 py-4 text-right font-mono tabular-nums">
        {numberFormatter.format(item.registeredParticipantsAtPeak)}
      </td>
      <td className="px-5 py-4 text-right font-mono tabular-nums">
        {numberFormatter.format(item.uniqueParticipantLogins)}
      </td>
      <td className="px-5 py-4 text-right font-mono tabular-nums">
        {numberFormatter.format(item.newParticipantRegistrations)}
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
        {formatDateTime(item.lastCollectedAt)}
      </td>
    </tr>
  );
}

function HistoryError({
  error,
  isFetching,
  retry,
}: {
  error: Error | null;
  isFetching: boolean;
  retry: () => void;
}) {
  return (
    <div className="grid justify-items-start gap-4 p-5 sm:p-6" role="alert">
      <div>
        <h3 className="text-lg font-bold">Não foi possível carregar o histórico</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {error instanceof Error
            ? error.message
            : "Verifique sua conexão e tente novamente."}
        </p>
      </div>
      <Button disabled={isFetching} onClick={retry} variant="outline">
        {isFetching ? "Consultando…" : "Tentar novamente"}
      </Button>
    </div>
  );
}

function formatDate(value: string): string {
  return operationalDateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

function useDefaultPresenceRange(): PresenceDateRange {
  return useSyncExternalStore(
    subscribe,
    getClientDefaultRange,
    getServerDefaultRange,
  );
}

function subscribe() {
  return () => undefined;
}

function getClientDefaultRange(): PresenceDateRange {
  const next = getDefaultPresenceRange();
  const key = `${next.from}:${next.to}`;
  if (key !== cachedDefaultRangeKey) {
    cachedDefaultRange = next;
    cachedDefaultRangeKey = key;
  }
  return cachedDefaultRange;
}

function getServerDefaultRange(): PresenceDateRange {
  return emptyRange;
}
