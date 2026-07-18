import { apiFetch } from "@/lib/http/client";
import type { PaginatedResponse } from "@/lib/http/pagination.types";
import { withQuery } from "@/lib/http/query-string";
import { serializeAuditApiFilters } from "./audit-filters";
import type { AdminAuditEvent, AuditFilters } from "./audit.types";

export function fetchAdminAuditEvents(filters: AuditFilters) {
  return apiFetch<PaginatedResponse<AdminAuditEvent>>(
    withQuery(
      "/admin/audit-events",
      serializeAuditApiFilters(filters) as Record<
        string,
        string | number | undefined
      >,
    ),
  );
}

export function fetchParticipantAuditEvents(
  participantId: string,
  filters: Pick<AuditFilters, "page" | "limit" | "operation" | "from" | "to">,
) {
  return apiFetch<PaginatedResponse<AdminAuditEvent>>(
    withQuery(
      `/admin/participants/${participantId}/audit-events`,
      serializeAuditApiFilters(filters as AuditFilters) as Record<
        string,
        string | number | undefined
      >,
    ),
  );
}
