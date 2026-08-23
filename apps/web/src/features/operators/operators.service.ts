import { apiFetch } from "@/lib/http/client";
import type { PaginatedResponse } from "@/lib/http/pagination.types";
import { withQuery } from "@/lib/http/query-string";
import type {
  AdminOperator,
  CreateOperatorPayload,
  OperatorActivationResult,
  OperatorsFilters,
  ResetOperatorActivationPayload,
  UpdateOperatorPayload,
  UpdateOperatorStatusPayload,
} from "./operators.types";

export function fetchOperators(filters: OperatorsFilters) {
  return apiFetch<PaginatedResponse<AdminOperator>>(
    withQuery("/admin/operators", filters),
    undefined,
  );
}

export function createOperator(payload: CreateOperatorPayload) {
  return apiFetch<OperatorActivationResult>("/admin/operators", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOperator(id: string, payload: UpdateOperatorPayload) {
  return apiFetch<AdminOperator>(`/admin/operators/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateOperatorStatus(
  id: string,
  payload: UpdateOperatorStatusPayload,
) {
  return apiFetch<AdminOperator>(`/admin/operators/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function resetOperatorActivation(
  id: string,
  payload: ResetOperatorActivationPayload,
) {
  return apiFetch<OperatorActivationResult>(
    `/admin/operators/${id}/activation-reset`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
