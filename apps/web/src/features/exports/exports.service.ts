import { apiFetch } from "@/lib/http/client";
import { downloadFile } from "@/lib/http/download";
import { withQuery } from "@/lib/http/query-string";
import type {
  AdminExportCount,
  ParticipantExportFilters,
  RedemptionExportFilters,
} from "./exports.types";

export function fetchParticipantsExportCount(
  filters: ParticipantExportFilters,
) {
  return apiFetch<AdminExportCount>(
    withQuery("/admin/participants/export-count", filters),
  );
}

export function downloadParticipantsExport(filters: ParticipantExportFilters) {
  return downloadFile(withQuery("/admin/participants/export.csv", filters));
}

export function fetchRedemptionsExportCount(filters: RedemptionExportFilters) {
  return apiFetch<AdminExportCount>(
    withQuery("/admin/redemptions/export-count", filters),
  );
}

export function downloadRedemptionsExport(filters: RedemptionExportFilters) {
  return downloadFile(withQuery("/admin/redemptions/export.csv", filters));
}
