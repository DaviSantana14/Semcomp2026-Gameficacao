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
