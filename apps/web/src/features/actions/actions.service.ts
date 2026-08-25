import { apiFetch } from "@/lib/http/client";
import { downloadFile } from "@/lib/http/download";
import type { AdminExportCount } from "@/features/exports/exports.types";
import type { PaginatedResponse } from "@/lib/http/pagination.types";
import { withQuery } from "@/lib/http/query-string";
import type {
  Action,
  AdminAction,
  AdminCodeRedemption,
  AdminCodeRedemptionsFilters,
  AdminActionsFilters,
  AdminClaimCode,
  BulkUpdateClaimCodesPayload,
  ClaimCodeBatchSummary,
  ClaimCodeBulkOperationDetail,
  ClaimCodeBatchesFilters,
  AdminClaimCodesFilters,
  AdminReusableCode,
  AdminReusableCodesFilters,
  CreateActionPayload,
  CodeRedemptionsExportFilters,
  GenerateClaimCodesPayload,
  GeneratedClaimCodesResponse,
  RedeemActionResponse,
  ReusableCodeRedemption,
  UpdateActionPayload,
  UpdateClaimCodeStatusPayload,
  AdminQuestionGrantResponse,
  QuestionGrantParticipant,
  QuestionGrantParticipantsFilters,
} from "./actions.types";

export function redeemActionCode(code: string) {
  return apiFetch<RedeemActionResponse>("/actions/redeem-code", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function createAction(payload: CreateActionPayload) {
  return apiFetch<Action>("/actions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchActions() {
  return apiFetch<Action[]>("/actions");
}

export function fetchCodeRedemptions(filters: AdminCodeRedemptionsFilters) {
  return apiFetch<PaginatedResponse<AdminCodeRedemption>>(
    withQuery("/admin/code-redemptions", filters),
  );
}

export function fetchCodeRedemptionsExportCount(
  filters: CodeRedemptionsExportFilters,
) {
  return apiFetch<AdminExportCount>(
    withQuery("/admin/code-redemptions/export-count", filters),
  );
}

export function downloadCodeRedemptionsExport(
  filters: CodeRedemptionsExportFilters,
) {
  return downloadFile(
    withQuery("/admin/code-redemptions/export.csv", filters),
  );
}

export const fetchAdminCodeRedemptions = fetchCodeRedemptions;
export const fetchAdminCodeRedemptionsExportCount =
  fetchCodeRedemptionsExportCount;
export const downloadAdminCodeRedemptionsExport =
  downloadCodeRedemptionsExport;

export function generateClaimCodes(
  actionId: string,
  payload: GenerateClaimCodesPayload,
) {
  return apiFetch<GeneratedClaimCodesResponse>(
    `/admin/actions/${actionId}/claim-codes/generate`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function fetchClaimCodeBatches(filters: ClaimCodeBatchesFilters) {
  return apiFetch<PaginatedResponse<ClaimCodeBatchSummary>>(
    withQuery("/admin/claim-code-batches", filters),
  );
}

export function fetchAdminActions(filters: AdminActionsFilters) {
  return apiFetch<PaginatedResponse<AdminAction>>(
    withQuery("/admin/actions", filters),
  );
}

export function fetchQuestionGrantParticipants(
  filters: QuestionGrantParticipantsFilters,
) {
  return apiFetch<PaginatedResponse<QuestionGrantParticipant>>(
    withQuery("/admin/question-grants/participants", filters),
  );
}

export function grantQuestionAction(actionId: string, participantId: string) {
  return apiFetch<AdminQuestionGrantResponse>(
    `/admin/actions/${actionId}/participants/${participantId}/grant`,
    { method: "POST" },
  );
}

export function updateAction(id: string, payload: UpdateActionPayload) {
  return apiFetch<Action>(`/admin/actions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminClaimCodes(filters: AdminClaimCodesFilters) {
  return apiFetch<PaginatedResponse<AdminClaimCode>>(
    withQuery("/admin/claim-codes", filters),
  );
}

export function updateClaimCodeStatus(
  id: string,
  payload: UpdateClaimCodeStatusPayload,
) {
  return apiFetch<AdminClaimCode>(`/admin/claim-codes/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function bulkUpdateClaimCodes(payload: BulkUpdateClaimCodesPayload) {
  return apiFetch<ClaimCodeBulkOperationDetail>(
    "/admin/claim-codes/bulk-status",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function fetchClaimCodeBulkOperation(operationId: string) {
  return apiFetch<ClaimCodeBulkOperationDetail>(
    `/admin/claim-code-bulk-operations/${operationId}`,
  );
}

export function downloadClaimCodeBulkReport(operationId: string) {
  return downloadFile(
    `/admin/claim-code-bulk-operations/${operationId}/report.csv`,
  );
}

export function fetchAdminReusableCodes(filters: AdminReusableCodesFilters) {
  return apiFetch<PaginatedResponse<AdminReusableCode>>(
    withQuery("/admin/reusable-codes", filters),
  );
}

export function fetchReusableCodeRedemptions(
  actionId: string,
  filters: { page: number; limit: number },
) {
  return apiFetch<PaginatedResponse<ReusableCodeRedemption>>(
    withQuery(`/admin/reusable-codes/${actionId}/redemptions`, filters),
  );
}
