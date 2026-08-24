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
  RECONCILIATION_COMPENSATION: "Compensação de reconciliação",
};

const POINT_EVENT_KIND_LABELS = {
  CREDIT: "Crédito",
  DEBIT: "Débito",
} as const;

const POINT_EVENT_METHOD_LABELS = {
  DIRECT: "Registro direto",
  REUSABLE_CODE: "Código reutilizável",
  CLAIM_CODE: "Código de uso único",
  LEGACY_UNKNOWN: "Método histórico desconhecido",
} as const;

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

export function getPointEventKindLabel(kind: "CREDIT" | "DEBIT") {
  return POINT_EVENT_KIND_LABELS[kind];
}

export function getPointEventMethodLabel(
  method: "DIRECT" | "REUSABLE_CODE" | "CLAIM_CODE" | "LEGACY_UNKNOWN" | null,
) {
  return method ? POINT_EVENT_METHOD_LABELS[method] : "Não se aplica";
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
