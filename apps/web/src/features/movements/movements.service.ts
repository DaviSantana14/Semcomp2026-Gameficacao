import type { AdminExportCount } from "@/features/exports/exports.types";
import { apiFetch } from "@/lib/http/client";
import { downloadFile } from "@/lib/http/download";
import type { PaginatedResponse } from "@/lib/http/pagination.types";
import { withQuery } from "@/lib/http/query-string";
import type {
  AdminPointEvent,
  AdminPointEventsFilters,
  MovementExportFilters,
} from "./movements.types";

export function fetchMovements(filters: AdminPointEventsFilters) {
  return apiFetch<PaginatedResponse<AdminPointEvent>>(
    withQuery("/admin/point-events", filters),
  );
}

export function fetchMovementsExportCount(filters: MovementExportFilters) {
  return apiFetch<AdminExportCount>(
    withQuery("/admin/point-events/export-count", filters),
  );
}

export function downloadMovementsExport(filters: MovementExportFilters) {
  return downloadFile(withQuery("/admin/point-events/export.csv", filters));
}

export const fetchAdminPointEvents = fetchMovements;
export const fetchAdminPointEventsExportCount = fetchMovementsExportCount;
export const downloadAdminPointEventsExport = downloadMovementsExport;
