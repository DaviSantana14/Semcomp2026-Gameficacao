import type { AdminParticipantPointEvent } from "./participants.types";

const POINT_EVENT_SOURCE_LABELS: Record<
  AdminParticipantPointEvent["source"],
  string
> = {
  ACTION_REDEEM: "Atividade",
  ADMIN_GRANT: "Concessão administrativa",
  ADMIN_ADJUST: "Ajuste administrativo",
  REWARD_REDEMPTION: "Lojinha",
};

const POINT_EVENT_ORIGIN_LABELS: Record<
  AdminParticipantPointEvent["origin"],
  string
> = {
  UNIQUE_CODE: "Código único",
  REUSABLE_CODE: "Código reutilizável",
  DIRECT_ACTION: "Registro direto",
  LEGACY_UNKNOWN: "Origem histórica desconhecida",
  REWARD: "Lojinha",
  ADMIN: "Administrativa",
};

export function getPointEventSourceLabel(
  source: AdminParticipantPointEvent["source"],
): string {
  return POINT_EVENT_SOURCE_LABELS[source];
}

export function getPointEventOriginLabel(
  origin: AdminParticipantPointEvent["origin"],
): string {
  return POINT_EVENT_ORIGIN_LABELS[origin];
}

export function formatPointEventDetail(
  event: AdminParticipantPointEvent,
): string | null {
  if (event.source !== "ACTION_REDEEM") {
    return event.description?.trim() || null;
  }
  if (event.origin === "UNIQUE_CODE" && event.claimCode) {
    return `${getPointEventOriginLabel(event.origin)} · ${event.claimCode.code}`;
  }
  return getPointEventOriginLabel(event.origin);
}
