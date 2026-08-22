import { apiFetch } from "@/lib/http/client";
import { downloadFile } from "@/lib/http/download";
import type {
  PresenceDateRange,
  PresenceHistory,
  PresenceOverview,
} from "./presence.types";

const OPERATIONAL_TIME_ZONE = "America/Sao_Paulo";

export type {
  PresenceDateRange,
  PresenceDay,
  PresenceHistory,
  PresenceHistoryItem,
  PresenceOverview,
  PresencePeak,
} from "./presence.types";

export function encodePresenceDateRange(range: PresenceDateRange): string {
  return new URLSearchParams({ from: range.from, to: range.to }).toString();
}

export function fetchPresenceOverview() {
  return apiFetch<PresenceOverview>("/admin/presence/overview");
}

export function fetchPresenceHistory(range: PresenceDateRange) {
  return apiFetch<PresenceHistory>(
    `/admin/presence/history?${encodePresenceDateRange(range)}`,
  );
}

export function downloadPresenceCsv(range: PresenceDateRange) {
  return downloadFile(
    `/admin/presence/export.csv?${encodePresenceDateRange(range)}`,
  );
}

export function getDefaultPresenceRange(now = new Date()): PresenceDateRange {
  const today = formatOperationalDate(now);
  return {
    from: shiftOperationalDate(today, -6),
    to: shiftOperationalDate(today, 1),
  };
}

export function sendHeartbeat(signal: AbortSignal): Promise<void> {
  return apiFetch<void>("/auth/heartbeat", {
    method: "POST",
    signal,
  });
}

function formatOperationalDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: OPERATIONAL_TIME_ZONE,
    year: "numeric",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Não foi possível determinar a data operacional.");
  }

  return `${year}-${month}-${day}`;
}

function shiftOperationalDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
