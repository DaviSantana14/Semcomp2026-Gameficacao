import {
  AUDIT_ACTOR_TYPES,
  AUDIT_ENTITY_TYPES,
  AUDIT_OPERATIONS,
  type AuditFilterPatch,
  type AuditFilters,
} from "./audit.types";

export const AUDIT_PAGE_LIMIT = 20;

export function parseAuditUrlFilters(params: URLSearchParams): AuditFilters {
  const page = parsePositiveInteger(params.get("page"), 1);
  const requestedLimit = parsePositiveInteger(
    params.get("limit"),
    AUDIT_PAGE_LIMIT,
  );
  const limit = requestedLimit <= 100 ? requestedLimit : AUDIT_PAGE_LIMIT;
  return compact({
    page,
    limit,
    actorType: enumValue(params.get("actorType"), AUDIT_ACTOR_TYPES),
    actorAdminId: textValue(params.get("actorAdminId")),
    actorSearch: textValue(params.get("actorSearch")),
    operation: enumValue(params.get("operation"), AUDIT_OPERATIONS),
    entityType: enumValue(params.get("entityType"), AUDIT_ENTITY_TYPES),
    entityId: textValue(params.get("entityId")),
    entitySearch: textValue(params.get("entitySearch")),
    participantId: textValue(params.get("participantId")),
    participantSearch: textValue(params.get("participantSearch")),
    requestId: textValue(params.get("requestId")),
    from: dateValue(params.get("from")),
    to: dateValue(params.get("to")),
  }) as AuditFilters;
}

export function serializeAuditApiFilters(filters: AuditFilters) {
  return compact({
    ...filters,
    from: filters.from ? `${filters.from}T00:00:00.000-03:00` : undefined,
    to: filters.to ? `${filters.to}T23:59:59.999-03:00` : undefined,
  });
}

export function updateAuditUrlFilters(
  current: URLSearchParams,
  patch: AuditFilterPatch,
) {
  const next = new URLSearchParams(current.toString());
  if (!isAcceptedLimit(next.get("limit"))) next.delete("limit");
  for (const [key, rawValue] of Object.entries(patch)) {
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (value === undefined || value === "" || value === 1) next.delete(key);
    else next.set(key, String(value));
  }
  if (!("page" in patch)) next.delete("page");
  next.sort();
  return next;
}

function isAcceptedLimit(value: string | null) {
  if (value === null) return true;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100;
}

export function auditQueryKey(filters: AuditFilters) {
  return ["admin", "audit-events", filters] as const;
}

export function isValidAuditDateRange(from?: string, to?: string) {
  return !from || !to || from <= to;
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function textValue(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 100) : undefined;
}

function enumValue<const T extends readonly string[]>(
  value: string | null,
  values: T,
): T[number] | undefined {
  return value && values.includes(value) ? (value as T[number]) : undefined;
}

function dateValue(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : undefined;
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}
